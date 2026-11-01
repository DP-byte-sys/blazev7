import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AuthProvider, useAuth } from '../src/features/auth/AuthProvider';
import { useDraftStore } from '../src/store/useDraftStore';
import { colors } from '../src/theme/tokens';

SplashScreen.preventAutoHideAsync().catch(() => {});

function Navigator() {
  const { status } = useAuth();
  const signedIn = status === 'signedIn';
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.brand900 },
        headerTintColor: colors.textInverse,
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      {/* Signed-out users cannot reach these routes. (UI guard only: data access is enforced by the backend.) */}
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="tickets/new" options={{ title: 'New ticket' }} />
        <Stack.Screen name="tickets/[id]" options={{ title: 'Ticket' }} />
        <Stack.Screen name="profile" options={{ title: 'Profile' }} />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}

function Splash({ ready }: { ready: boolean }) {
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);
  return null;
}

/** Loads the signed-in user's local draft, and wipes local drafts when signed out (another person may use this device). */
function DraftSync() {
  const { status, session } = useAuth();
  const userId = session?.user.id ?? null;
  const load = useDraftStore((s) => s.load);
  const clearAll = useDraftStore((s) => s.clearAll);
  useEffect(() => {
    if (status === 'signedIn' && userId) void load(userId);
    else if (status === 'signedOut') void clearAll();
  }, [status, userId, load, clearAll]);
  return null;
}

function Gate() {
  const { status } = useAuth();
  const ready = status !== 'loading';
  return (
    <>
      <Splash ready={ready} />
      <DraftSync />
      {ready ? <Navigator /> : null}
    </>
  );
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });
  // If the font fails to load we still show the app with the system font fallback.
  if (!loaded && !error) return null;
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <Gate />
    </AuthProvider>
  );
}
