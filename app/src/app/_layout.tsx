import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { AuthProvider, useAuth } from '../lib/auth';
import { colors } from '../lib/theme';

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <RootNavigator />
    </AuthProvider>
  );
}

function RootNavigator() {
  const { user, ready } = useAuth();
  // Mount screens only after the saved session is restored, otherwise a reload on a
  // signed-in page sends its first request without a token.
  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  // A guarded route falls back to `index`, which shows sign-in or redirects home.
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.ink,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="product/[id]" options={{ title: '' }} />
      <Stack.Protected guard={user?.role === 'ARTISAN'}>
        <Stack.Screen name="artisan/index" options={{ title: 'My studio' }} />
        <Stack.Screen name="artisan/new" options={{ title: 'New product' }} />
      </Stack.Protected>
      <Stack.Protected guard={user?.role === 'BUYER'}>
        <Stack.Screen name="buyer/index" options={{ title: 'Discover handmade' }} />
        <Stack.Screen name="orders" options={{ title: 'My orders' }} />
      </Stack.Protected>
    </Stack>
  );
}
