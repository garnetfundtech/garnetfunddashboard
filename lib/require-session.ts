import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function requireSessionUser() {
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
