import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { Button, Chip, Field, Screen } from '../components/ui';
import { useAuth } from '../lib/auth';
import { colors, space } from '../lib/theme';
import type { Role } from '../lib/types';

export default function Welcome() {
  const { user, ready, login } = useAuth();
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('BUYER');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!ready)
    return (
      <Screen style={s.center}>
        <ActivityIndicator />
      </Screen>
    );
  if (user) return <Redirect href={user.role === 'ARTISAN' ? '/artisan' : '/buyer'} />;

  async function go() {
    setBusy(true);
    setError('');
    try {
      const u = await login(name.trim(), role);
      router.replace(u.role === 'ARTISAN' ? '/artisan' : '/buyer');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen style={s.center}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.box}>
        <Text style={s.brand}>Artisan Studio</Text>
        <Text style={s.tag}>Handmade goods, with the story of how they were made.</Text>
        <Field
          label="Your name"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Meera"
          autoCapitalize="words"
        />
        <Text style={s.label}>I am a…</Text>
        <View style={{ flexDirection: 'row', gap: space(2) }}>
          <Chip label="Buyer" active={role === 'BUYER'} onPress={() => setRole('BUYER')} />
          <Chip label="Artisan" active={role === 'ARTISAN'} onPress={() => setRole('ARTISAN')} />
        </View>
        {!!error && <Text style={{ color: colors.danger }}>{error}</Text>}
        <Button title="Continue" onPress={go} disabled={!name.trim()} loading={busy} />
        <Text style={s.note}>Demo sign-in: no password. Use the same name to come back to your account.</Text>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const s = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', padding: space(5) },
  box: { width: '100%', maxWidth: 420, gap: space(4) },
  brand: { fontSize: 32, fontWeight: '800', color: colors.ink },
  tag: { fontSize: 16, color: colors.muted, marginBottom: space(2) },
  label: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  note: { fontSize: 12, color: colors.muted, textAlign: 'center' },
});
