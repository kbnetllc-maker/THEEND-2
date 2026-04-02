'use client';

import { getBrowserSupabase } from '@/lib/supabase/browser';

/** Returns current access token for API Bearer auth, or null. */
export async function getAccessToken(): Promise<string | null> {
  const supabase = getBrowserSupabase();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function signOut(): Promise<void> {
  const supabase = getBrowserSupabase();
  await supabase.auth.signOut();
}
