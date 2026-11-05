window.__MERIDIAN_ENV__ = {
  supabaseUrl: '{{env "PUBLIC_SUPABASE_URL" | js}}',
  supabaseAnonKey: '{{env "PUBLIC_SUPABASE_ANON_KEY" | js}}',
  powersyncUrl: '{{env "PUBLIC_POWERSYNC_URL" | js}}',
}
