import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase/server';

export type AuthResult =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse };

/**
 * Validates `Authorization: Bearer <access_token>` via `auth.getUser(jwt)` (service role server-side).
 */
export async function getUserFromBearer(req: Request): Promise<AuthResult> {
  const h = req.headers.get('authorization');
  if (!h?.startsWith('Bearer ')) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Missing or invalid Authorization header' },
        { status: 401 }
      ),
    };
  }
  const jwt = h.slice(7).trim();
  if (!jwt) {
    return { ok: false, response: NextResponse.json({ error: 'Missing JWT' }, { status: 401 }) };
  }
  try {
    const supabase = getServiceSupabase();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(jwt);
    if (error || !user) {
      return {
        ok: false,
        response: NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 }),
      };
    }
    return { ok: true, userId: user.id };
  } catch (e) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: e instanceof Error ? e.message : 'Auth failed' },
        { status: 401 }
      ),
    };
  }
}
