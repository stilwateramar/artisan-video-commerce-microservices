import { router, useFocusEffect, Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Button, Screen, StatusPill } from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { duration, money } from '../../lib/format';
import { colors, radius, space } from '../../lib/theme';
import type { Product } from '../../lib/types';

export default function ArtisanHome() {
  const { user, logout } = useAuth();
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems((await api.myProducts()).products);
      setError('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    if (!items.some((p) => p.status !== 'READY' && p.status !== 'FAILED')) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [items, load]);

  return (
    <Screen>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Text
              onPress={async () => {
                await logout();
                router.replace('/');
              }}
              style={s.link}
            >
              Sign out
            </Text>
          ),
        }}
      />
      <View style={s.head}>
        <Text style={s.hello}>Hi {user?.name} 👋</Text>
        <Button title="+ Upload process video" onPress={() => router.push('/artisan/new')} />
      </View>
      {!!error && <Text style={s.err}>{error}</Text>}
      <FlatList
        data={items}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{
          padding: space(4),
          gap: space(3),
          maxWidth: 900,
          width: '100%',
          alignSelf: 'center',
        }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListEmptyComponent={
          !loading ? <Text style={s.empty}>No products yet. Upload your first process video.</Text> : null
        }
        renderItem={({ item: p }) => (
          <Pressable style={s.row} onPress={() => p.status === 'READY' && router.push(`/product/${p.id}`)}>
            <View style={s.thumb}>
              {p.thumbnailUrl ? (
                <Image source={{ uri: p.thumbnailUrl }} style={StyleSheet.absoluteFill} />
              ) : null}
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={s.title} numberOfLines={1}>
                {p.title}
              </Text>
              <Text style={s.meta}>
                {money(p.priceMinor, p.currency)} {p.durationSec ? `· ${duration(p.durationSec)}` : ''}
              </Text>
              <StatusPill status={p.status} />
              {p.status === 'FAILED' && !!p.error && (
                <Text style={s.err} numberOfLines={2}>
                  {p.error}
                </Text>
              )}
            </View>
          </Pressable>
        )}
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  head: { padding: space(4), gap: space(3), maxWidth: 900, width: '100%', alignSelf: 'center' },
  hello: { fontSize: 22, fontWeight: '800', color: colors.ink },
  row: {
    flexDirection: 'row',
    gap: space(3),
    backgroundColor: '#fff',
    borderRadius: radius,
    padding: space(3),
    borderWidth: 1,
    borderColor: colors.border,
  },
  thumb: { width: 96, height: 72, borderRadius: 8, backgroundColor: '#E9E1D8', overflow: 'hidden' },
  title: { fontSize: 16, fontWeight: '700', color: colors.ink },
  meta: { color: colors.muted },
  err: { color: colors.danger, paddingHorizontal: space(4) },
  empty: { color: colors.muted, textAlign: 'center', marginTop: space(10) },
  link: { color: colors.accent, fontWeight: '700', paddingHorizontal: space(3) },
});
