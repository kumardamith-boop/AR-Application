import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const configured = Boolean(SUPABASE_URL && SUPABASE_KEY);

export const supabase = configured
  ? createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

export const BUCKET = 'cheques';

function clean(error) {
  const msg = error?.message || String(error);
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) {
    return 'No connection. Check your signal and try again.';
  }
  if (/JWT expired|invalid JWT/i.test(msg)) return 'Your sign-in expired. Sign in again.';
  return msg;
}

/** Call a cc_* database function; throws an Error with a plain message. */
export async function rpc(name, args = {}) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(clean(error));
  return data;
}

/** Await a query builder; throws an Error with a plain message. */
export async function q(builder) {
  const { data, error } = await builder;
  if (error) throw new Error(clean(error));
  return data;
}

/** Fetch every row of a query in pages of 1000 (PostgREST default limit). */
export async function qAll(makeBuilder, pageSize = 1000) {
  const out = [];
  for (let from = 0; ; from += pageSize) {
    const rows = await q(makeBuilder().range(from, from + pageSize - 1));
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}

export function errText(e) {
  return clean(e);
}
