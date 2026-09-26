import 'server-only';

/** Read the public Supabase environment for server-side clients. */
export function requirePublicEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey || url === 'https://CHANGE_ME.supabase.co' || anonKey === 'CHANGE_ME') {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set in .env.local. ' +
        'See .env.example.',
    );
  }

  return { url, anonKey };
}