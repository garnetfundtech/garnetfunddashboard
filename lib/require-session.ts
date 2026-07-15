import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export async function requireSessionUser() {
  if (!isSupabaseConfigured) {
    return {
      user: null as null,
      response: NextResponse.json({ ok: false, message: "Supabase not configured" }, { status: 503 }),
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      user: null as null,
      response: NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 }),
    };
  }
  return { user, response: null as null };
}
