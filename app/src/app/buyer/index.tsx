import { router, Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { ProductCard } from '../../components/ProductCard';
import { Chip, Screen } from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { colors, radius, space } from '../../lib/theme';
import type { Product } from '../../lib/types';

export default function BuyerHome() {
  const { logout } = useAuth();
  const { width } = useWindowDimensions();
  const cols = width >= 1100 ? 4 : width >= 700 ? 3 : 2;
  const contentWidth = Math.min(width, 1200) - space(4) * 2;
  const cardW = (contentWidth - space(3) * (cols - 1)) / cols;

  const [q, setQ] = useState('');
  const [tag, setTag] = useState<string | undefined>();
  const [tags, setTags] = useState<string[]>([]);
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .tags()
      .then((r) => setTags(r.tags))
      .catch(() => {});
  }, []);

  const search = useCallback(async (query: string, t?: string) => {
    setLoading(true);
    try {
      setItems((await api.search(query, t)).products);
      setError('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const h = setTimeout(() => search(q, tag), 300); // debounce typing
    return () => clearTimeout(h);
  }, [q, tag, search]);

  return (
    <Screen>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={{ flexDirection: 'row', gap: space(4), paddingHorizontal: space(3) }}>
              <Text style={s.link} onPress={() => router.push('/orders')}>
                Orders
              </Text>
              <Text
                style={s.link}
                onPress={async () => {
                  await logout();
                  router.replace('/');
                }}
              >
                Sign out
              </Text>
            </View>
          ),
        }}
      />
      <FlatList
        key={cols}
        data={items}
        numColumns={cols}
        keyExtractor={(p) => p.id}
        columnWrapperStyle={cols > 1 ? { gap: space(3) } : undefined}
        contentContainerStyle={{
          padding: space(4),
          gap: space(3),
          width: '100%',
          maxWidth: 1200,
          alignSelf: 'center',
        }}
        ListHeaderComponent={
          <View style={{ gap: space(3), marginBottom: space(2) }}>
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="Search handmade: pottery, wooden bowl, block print…"
              placeholderTextColor="#A99E95"
              style={s.search}
              returnKeyType="search"
            />
            {tags.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: space(2) }}
              >
                <Chip label="All" active={!tag} onPress={() => setTag(undefined)} />
                {tags.map((t) => (
                  <Chip
                    key={t}
                    label={`#${t}`}
                    active={tag === t}
                    onPress={() => setTag(tag === t ? undefined : t)}
                  />
                ))}
              </ScrollView>
            )}
            {!!error && <Text style={{ color: colors.danger }}>{error}</Text>}
          </View>
        }
        ListEmptyComponent={!loading ? <Text style={s.empty}>No products found.</Text> : null}
        renderItem={({ item }) => (
          <ProductCard p={item} width={cardW} onPress={() => router.push(`/product/${item.id}`)} />
        )}
        refreshing={loading}
        onRefresh={() => search(q, tag)}
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  search: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius,
    padding: space(3),
    fontSize: 16,
    color: colors.ink,
  },
  empty: { color: colors.muted, textAlign: 'center', marginTop: space(10) },
  link: { color: colors.accent, fontWeight: '700' },
});
