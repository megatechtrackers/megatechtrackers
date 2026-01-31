import { useEffect, useRef } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/lib/auth';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { requestNotificationPermissions } from '@/utils/notifications';
import { Platform } from 'react-native';

function RootLayoutNav() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const subscriptionsRef = useRef<{ remove: () => void }[]>([]);

  // Initialize notifications on app start
  useEffect(() => {
    // Expo web: avoid touching notifications APIs that may not exist / may throw.
    if (Platform.OS === 'web') return;

    requestNotificationPermissions().catch(() => {});

    // Lazy-load expo-notifications to avoid side-effect import errors
    (async () => {
      try {
        const Notifications = await import('expo-notifications');
        
        // Listen for notifications when app is in foreground
        const subscription = Notifications.addNotificationReceivedListener((_notification) => {});
        // Listen for notification taps
        const responseSubscription = Notifications.addNotificationResponseReceivedListener((_response) => {});

        subscriptionsRef.current = [subscription, responseSubscription];
      } catch (e) {
        console.warn('Notifications listeners skipped:', e);
      }
    })();

    return () => {
      subscriptionsRef.current.forEach(sub => sub.remove());
    };
  }, []);

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inTabsGroup = segments[0] === '(tabs)';

    if (!user && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (user && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [user, loading, segments]);

  return (
    <ErrorBoundary>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </ErrorBoundary>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <RootLayoutNav />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
