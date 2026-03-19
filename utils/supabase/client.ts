import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

function requireEnv(value: string | undefined, key: string) {
  if (!value) {
    throw new Error(`Missing Supabase environment variable: ${key}`);
  }

  return value;
}

export const createClient = () =>
  createBrowserClient(
    requireEnv(supabaseUrl, 'NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv(supabaseKey, 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY'),
  );
