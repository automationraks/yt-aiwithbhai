import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/auth/session";
import { logWorkflowEvent } from "@/lib/workflow-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
function normalizeTranscript(value: string) {
  return value.toLocaleLowerCase().normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(/\s+/).filter(Boolean);
}
function transcriptMatches(expected: string, actual: string) {
  const a = normalizeTranscript(expected);
  const b = normalizeTranscript(actual);
  return a.length > 0 && a.length === b.length && a.every((word, index) => word === b[index]);
}

export async function POST(request: Request) {
  const secret = process.env.N8N_WEBHOOK_SECRET;
  const supplied = request.headers.get("x-production-callback-secret") || "";
  if (!secret || !safeEqual(secret, supplied)) {
    return NextResponse.json({ error: "Unauthorized callback." }, { status: 401 });
  }

  let body: {
    ownerId?: unknown; ideaId?: unknown; status?: unknown;
    finalStoragePath?: unknown; transcript?: unknown; scriptHash?: unknown;
    segmentResults?: unknown; durationSeconds?: unknown; error?: unknown;
  };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  if (typeof body.ownerId !== "string" || typeof body.ideaId !== "string" ||
      typeof body.status !== "string") {
    return NextResponse.json({ error: "ownerId, ideaId and status are required." }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: idea, error } = await supabase.from("content_ideas").select("*")
    .eq("id", body.ideaId).eq("owner_id", body.ownerId).maybeSingle();
  if (error || !idea) return NextResponse.json({ error: "Production record not found." }, { status: 404 });

  if (body.status === "failed") {
    await logWorkflowEvent({ownerId:body.ownerId,ideaId:body.ideaId,workflow:"video_production",eventKey:"render_failed",stage:"render_failed",status:"failed",message:"Local video rendering failed.",metadata:{error:String(body.error||"Rendering failed").slice(0,800)}});
    await supabase.from("content_ideas").update({
      video_production_status: "failed",
      video_verification: { stage: "render_failed", detail: String(body.error || "Rendering failed").slice(0, 1000) }
    }).eq("id", body.ideaId).eq("owner_id", body.ownerId);
    await supabase.from("app_notifications").insert({
      owner_id: body.ownerId, notification_type: "video_production_failed",
      title: "Video production failed",
      message: "The video could not be completed. Review the production details and retry.",
      resource_type: "content_idea", resource_id: body.ideaId,
      metadata: { stage: "render_failed" }
    });
    return NextResponse.json({ ok: true, status: "failed" });
  }

  if (body.status !== "completed" || typeof body.finalStoragePath !== "string" ||
      typeof body.transcript !== "string" || typeof body.scriptHash !== "string" ||
      !Array.isArray(body.segmentResults)) {
    return NextResponse.json({ error: "Completed callback requires finalStoragePath, transcript, scriptHash and segmentResults." }, { status: 400 });
  }

  const expectedPath = body.ownerId + "/" + body.ideaId + "/final.mp4";
  if (body.finalStoragePath !== expectedPath) {
    return NextResponse.json({ error: "Final video storage path is not valid for this owner and idea." }, { status: 400 });
  }
  const approvedScript = String(idea.approved_script_snapshot || "");
  const expectedHash = createHash("sha256").update(approvedScript, "utf8").digest("hex");
  if (!approvedScript || !safeEqual(expectedHash, body.scriptHash) ||
      !safeEqual(String(idea.approved_script_hash || ""), body.scriptHash)) {
    return NextResponse.json({ error: "Approved script hash mismatch. Video cannot be accepted." }, { status: 409 });
  }

  const expectedSegments = Array.isArray(idea.video_segments) ? idea.video_segments : [];
  const receivedSegments = body.segmentResults as Array<{sequence?:number;storagePath?:string;status?:string}>;
  const orderedSegments = receivedSegments.length === expectedSegments.length &&
    expectedSegments.every((segment: {sequence:number;outputStoragePath:string}, index:number) =>
      receivedSegments[index]?.sequence === segment.sequence &&
      receivedSegments[index]?.storagePath === segment.outputStoragePath &&
      receivedSegments[index]?.status === "completed");
  if (!orderedSegments) {
    await supabase.from("content_ideas").update({
      video_production_status: "review_required",
      video_verification: { stage: "segment_validation_failed", expectedSegments: expectedSegments.length, receivedSegments: receivedSegments.length }
    }).eq("id", body.ideaId).eq("owner_id", body.ownerId);
    await supabase.from("app_notifications").insert({
      owner_id: body.ownerId, notification_type: "video_review_required",
      title: "Video needs production review",
      message: "One or more seven-second clips are missing, failed or out of sequence. The video has not been marked ready.",
      resource_type: "content_idea", resource_id: body.ideaId,
      metadata: { stage: "segment_validation_failed" }
    });
    return NextResponse.json({ ok: false, status: "review_required", reason: "Segment sequence validation failed." }, { status: 409 });
  }

  await logWorkflowEvent({ownerId:body.ownerId,ideaId:body.ideaId,workflow:"video_production",eventKey:"segments_uploaded",stage:"segments_uploaded",status:"completed",message:"All ordered video segments and final MP4 were uploaded; transcript verification started.",metadata:{segmentCount:receivedSegments.length,durationSeconds:Number(body.durationSeconds)||null}});
  const transcript = body.transcript;
  const matches = transcriptMatches(approvedScript, transcript);
  const { data: bucketFile } = await supabase.storage.from("generated-videos").list(
    body.ownerId + "/" + body.ideaId, { search: "final.mp4", limit: 10 }
  );
  const finalExists = (bucketFile || []).some(file => file.name === "final.mp4");
  if (!finalExists) {
    return NextResponse.json({ error: "Final MP4 was not found in the private generated-videos bucket." }, { status: 409 });
  }

  const verified = matches && safeEqual(expectedHash, body.scriptHash);
  const nextStatus = verified ? "ready" : "review_required";
  await logWorkflowEvent({ownerId:body.ownerId,ideaId:body.ideaId,workflow:"video_production",eventKey:verified?"transcript_verified":"transcript_mismatch",stage:verified?"transcript_verified":"transcript_review_required",status:verified?"completed":"review_required",message:verified?"Final transcript exactly matches the approved narration.":"Final transcript differs from the approved narration; publishing remains blocked.",metadata:{segmentCount:expectedSegments.length,durationSeconds:Number(body.durationSeconds)||null}});
  const { error: updateError } = await supabase.from("content_ideas").update({
    video_production_status: nextStatus,
    video_transcript: transcript,
    video_storage_path: expectedPath,
    video_url: null,
    video_completed_at: new Date().toISOString(),
    video_verification: {
      stage: verified ? "verified" : "transcript_mismatch",
      transcriptMatchesApprovedScript: matches,
      approvedScriptHash: expectedHash,
      receivedScriptHash: body.scriptHash,
      durationSeconds: Number(body.durationSeconds) || null,
      segmentCount: expectedSegments.length,
      verifiedAt: new Date().toISOString()
    }
  }).eq("id", body.ideaId).eq("owner_id", body.ownerId);
  if (updateError) return NextResponse.json({ error: "Could not save production result.", details: updateError.message }, { status: 500 });

  await logWorkflowEvent({ownerId:body.ownerId,ideaId:body.ideaId,workflow:"video_production",eventKey:verified?"video_ready":"video_review_required",stage:verified?"production_completed":"review_required",status:verified?"completed":"review_required",message:verified?"Video passed transcript verification and is ready for owner review.":"Video requires owner review before publishing.",metadata:{transcriptMatchesApprovedScript:matches}});
  await supabase.from("app_notifications").insert({
    owner_id: body.ownerId,
    notification_type: verified ? "video_ready" : "video_transcript_mismatch",
    title: verified ? "Your video is ready for review" : "Video transcript needs review",
    message: verified
      ? "The final video was stored securely and its transcript matches the approved script."
      : "The final transcript differs from the approved narration. The video is blocked from publishing until reviewed.",
    resource_type: "content_idea", resource_id: body.ideaId,
    metadata: { status: nextStatus, transcriptMatchesApprovedScript: matches }
  });
  return NextResponse.json({ ok: true, status: nextStatus, transcriptMatchesApprovedScript: matches });
}
