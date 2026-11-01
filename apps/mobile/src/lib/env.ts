// Expo inlines EXPO_PUBLIC_* variables only when accessed with this literal syntax.
export const env = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
};
export const isBackendConfigured = env.supabaseUrl.length > 0 && env.supabaseKey.length > 0;
