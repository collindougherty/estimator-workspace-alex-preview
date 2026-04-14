const requireEnv = (value: string | undefined, label: string) => {
  if (!value) {
    throw new Error(`Missing ${label}. Check your .env.local configuration.`)
  }

  return value
}

export const env = {
  supabaseUrl: requireEnv(import.meta.env.VITE_SUPABASE_URL, 'VITE_SUPABASE_URL'),
  supabasePublishableKey: requireEnv(
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    'VITE_SUPABASE_PUBLISHABLE_KEY',
  ),
  demoEmail: import.meta.env.VITE_DEMO_EMAIL ?? '',
  demoPassword: import.meta.env.VITE_DEMO_PASSWORD ?? '',
}
