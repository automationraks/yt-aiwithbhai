import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

export const ACTIVE_WORKSPACE_COOKIE = "aiwithbhai_workspace";
export type WorkspaceContext = { id: string; name: string; slug: string; timezone: string; is_default: boolean };

export async function getActiveWorkspace(db: SupabaseClient, ownerId: string): Promise<WorkspaceContext | null> {
  const cookieStore = await cookies();
  const requestedId = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value;
  if (requestedId) {
    const { data } = await db.from("channel_workspaces")
      .select("id,name,slug,timezone,is_default")
      .eq("id", requestedId).eq("owner_id", ownerId).eq("is_active", true).maybeSingle();
    if (data) return data as WorkspaceContext;
  }
  const { data: defaultWorkspace } = await db.from("channel_workspaces")
    .select("id,name,slug,timezone,is_default")
    .eq("owner_id", ownerId).eq("is_active", true).eq("is_default", true).maybeSingle();
  if (defaultWorkspace) return defaultWorkspace as WorkspaceContext;
  const { data } = await db.from("channel_workspaces")
    .select("id,name,slug,timezone,is_default")
    .eq("owner_id", ownerId).eq("is_active", true).order("created_at", { ascending: true }).limit(1).maybeSingle();
  return data as WorkspaceContext | null;
}
