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
  const status = event.status ?? "completed";
  const { error } = await db.from("workflow_event_logs").insert({
    owner_id: event.ownerId,
    idea_id: event.ideaId ?? null,
    workflow: event.workflow,
    event_key: event.eventKey,
    stage: event.stage,
    status,
    message: event.message,
    metadata: event.metadata ?? {},
  });
  if (error) console.error("Workflow event log failed:", error.message);

  // Failures create durable in-app notifications. A short deduplication window
  // prevents noisy duplicate alerts when callbacks are retried repeatedly.
  if (status === "failed") {
    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    let lookup = db.from("app_notifications").select("id")
      .eq("owner_id", event.ownerId).eq("notification_type", "workflow_failure")
      .gte("created_at", since);
    lookup = event.ideaId ? lookup.eq("resource_id", event.ideaId) : lookup.is("resource_id", null);
    const { data: existing, error: lookupError } = await lookup.limit(1);
    if (!lookupError && !existing?.length) {
      const { error: notificationError } = await db.from("app_notifications").insert({
        owner_id: event.ownerId,
        notification_type: "workflow_failure",
        title: event.workflow.replaceAll("_", " ") + " failed",
        message: event.message.slice(0, 1000),
        resource_type: event.ideaId ? "content_idea" : "workflow",
        resource_id: event.ideaId ?? null,
        metadata: { workflow: event.workflow, eventKey: event.eventKey, stage: event.stage, ...(event.metadata ?? {}) },
      });
      if (notificationError) console.error("Workflow failure notification failed:", notificationError.message);
    }
  }
}
