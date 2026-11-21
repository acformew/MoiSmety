import { createClient } from '@supabase/supabase-js';
import { validPublicConfig } from './publicConfig';
import { authStorage } from '../offline/storage';

const url = import.meta.env.VITE_SUPABASE_URL?.trim() || localStorage.getItem('moismety-url') || '';
const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || localStorage.getItem('moismety-key') || '';

export const isConfigured = validPublicConfig(url,key);

export const supabase = isConfigured
  ? createClient(url, key, {
      auth: {
        storage: authStorage,
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
