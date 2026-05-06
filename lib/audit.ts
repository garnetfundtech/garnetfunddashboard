import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type AuditPayload = {
  action: string;
  entity_type: string;
  entity_id?: string | null;
  metadata?: Record<string, unknown>;
};

export async function logAuditEvent(payload: AuditPayload) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  try {
    const admin = createAdminClient();
    await admin.from("audit_events").insert({
      actor_id: user.id,
      action: payload.action,
      entity_type: payload.entity_type,
      entity_id: payload.entity_id ?? null,
      metadata: payload.metadata ?? {},
    });
  } catch {
    // Non-fatal: never block the main action if audit logging fails
  }
}
