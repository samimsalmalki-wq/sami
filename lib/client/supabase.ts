"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null | undefined;

/** عميل Supabase في المتصفح للبث اللحظي فقط (Realtime). بدون إعداد يرجع null والواجهة تحدّث دوريًا */
export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // المفتاح العام: anon (الصيغة القديمة) أو publishable (الأحدث في Supabase)
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  client = url && key
    ? createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
        realtime: { params: { eventsPerSecond: 20 } },
      })
    : null;
  return client;
}
