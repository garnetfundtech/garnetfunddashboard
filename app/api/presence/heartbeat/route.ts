import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  await supabase.from("user_presence").upsert({
    user_id: user.id,
    last_seen_at: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
}
