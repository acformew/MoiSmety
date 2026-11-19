import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';

export const isConfigured =
  url.startsWith('https://') &&
  url.includes('.supabase.co') &&
  key.length >= 20 &&
  !url.includes('YOUR_PROJECT');

export const supabase = isConfigured
  ? createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export function db() {
  if (!supabase) {
    throw new Error('Сначала заполните VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY в .env');
  }
  return supabase;
}

export function assertSuccess(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}
