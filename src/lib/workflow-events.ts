import { createSupabaseAdminClient } from "@/lib/auth/session";

export type WorkflowEventInput = {
  ownerId: string;
  ideaId?: string | null;
  workflow: "idea_generation" | "video_production" | "publishing";
  eventKey: string;
  stage: string;
  status?: "started" | "completed" | "failed" | "skipped" | "review_required" | "queued" | "processing" | "scheduled";
  message: string;
  metadata?: Record<string, unknown>;
};

export async function logWorkflowEvent(event: WorkflowEventInput) {
  const db = createSupabaseAdminClient();
  const { error } = await db.from("workflow_event_logs").insert({
    owner_id: event.ownerId,
    idea_id: event.ideaId ?? null,
    workflow: event.workflow,
    event_key: event.eventKey,
    stage: event.stage,
    status: event.status ?? "completed",
    message: event.message,
    metadata: event.metadata ?? {},
  });
  if (error) console.error("Workflow event log failed:", error.message);
}
