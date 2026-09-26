'use client';

import { createBrowserClient } from '@supabase/ssr';

/**
 * Browser-side Supabase client factory. The ONLY sanctioned way a client
 * component obtains a Supabase connection. The anon key is public by design;
 * Row Level Security is what protects the data it can reach.
 */
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey || url === 'https://CHANGE_ME.supabase.co' || anonKey === 'CHANGE_ME') {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set in .env.local. ' +
        'See .env.example.',
    );
  }

  return createBrowserClient(url, anonKey);
}