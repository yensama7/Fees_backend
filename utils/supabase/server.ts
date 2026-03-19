import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

function requireEnv(value: string | undefined, key: string) {
  if (!value) {
    throw new Error(`Missing Supabase environment variable: ${key}`);
  }

  return value;
}

export const createClient = (cookieStore: Awaited<ReturnType<typeof cookies>>) => {
  return createServerClient(
    requireEnv(supabaseUrl, 'NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv(supabaseKey, 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY'),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    },
  );
};
