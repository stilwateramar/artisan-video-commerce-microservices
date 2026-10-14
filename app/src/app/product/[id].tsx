import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Button, Chip, Screen } from '../../components/ui';
import { VideoPlayer } from '../../components/VideoPlayer';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { duration, money } from '../../lib/format';
import { colors, radius, space } from '../../lib/theme';
import type { Order, Product } from '../../lib/types';

export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const wide = width >= 900; // tablet landscape / desktop: video and details side by side

  const [p, setP] = useState<Product | null>(null);
  const [qty, setQty] = useState(1);
  const [placing, setPlacing] = useState(false);
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .product(id)
      .then((r) => setP(r.product))
      .catch((e) => setError(e.message));
  }, [id]);

  async function buy() {
    if (!p) return;
    setPlacing(true);
    setError('');
    try {
      setOrder((await api.placeOrder(p.id, qty)).order);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setPlacing(false);
    }
  }

  if (!p)
    return (
      <Screen style={{ alignItems: 'center', justifyContent: 'center' }}>
        {error ? <Text>{error}</Text> : <ActivityIndicator />}
      </Screen>
    );

  return (
    <Screen>
      <Stack.Screen options={{ title: p.title }} />
      <ScrollView
        contentContainerStyle={[s.wrap, wide && { flexDirection: 'row', alignItems: 'flex-start' }]}
      >
        <View style={[{ gap: space(2) }, wide ? { flex: 3 } : { width: '100%' }]}>
          {p.hlsUrl ? (
            <VideoPlayer hlsUrl={p.hlsUrl} posterUrl={p.thumbnailUrl} />
          ) : (
            <Text>Video is still processing…</Text>
          )}
          <Text style={s.muted}>
            Behind-the-scenes process video{p.durationSec ? ` · ${duration(p.durationSec)}` : ''} · adaptive
            streaming from ~40 kbps
          </Text>
        </View>

        <View style={[s.panel, wide ? { flex: 2 } : { width: '100%' }]}>
          <Text style={s.title}>{p.title}</Text>
          <Text style={s.muted}>by {p.artisanName}</Text>
          <Text style={s.price}>{money(p.priceMinor, p.currency)}</Text>
          {!!p.description && <Text style={s.body}>{p.description}</Text>}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(2) }}>
            {p.tags.map((t) => (
              <Chip key={t} label={`#${t}`} />
            ))}
          </View>

          {order ? (
            <View style={s.success}>
              <Text style={s.successTitle}>✅ Order placed</Text>
              <Text>
                Order #{order.id.slice(-6).toUpperCase()} · {order.quantity} × {p.title}
              </Text>
              <Text style={{ fontWeight: '700' }}>Total {money(order.totalMinor, order.currency)}</Text>
              <Button title="View my orders" variant="ghost" onPress={() => router.push('/orders')} />
            </View>
          ) : user?.role === 'BUYER' ? (
            <View style={{ gap: space(3) }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(3) }}>
                <Text style={s.muted}>Qty</Text>
                <Chip label="−" onPress={() => setQty(Math.max(1, qty - 1))} />
                <Text style={{ fontSize: 18, fontWeight: '700' }}>{qty}</Text>
                <Chip label="+" onPress={() => setQty(Math.min(10, qty + 1))} />
              </View>
              <Button
                title={`Place order · ${money(p.priceMinor * qty, p.currency)}`}
                onPress={buy}
                loading={placing}
              />
              <Text style={s.small}>Demo checkout: payment is simulated. Shipping is out of scope.</Text>
            </View>
          ) : !user ? (
            <Button title="Sign in as a buyer to order" variant="ghost" onPress={() => router.replace('/')} />
          ) : null}
          {!!error && <Text style={{ color: colors.danger }}>{error}</Text>}
        </View>
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  wrap: { padding: space(4), gap: space(4), maxWidth: 1200, width: '100%', alignSelf: 'center' },
  panel: {
    gap: space(3),
    backgroundColor: '#fff',
    borderRadius: radius,
    padding: space(4),
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: { fontSize: 22, fontWeight: '800', color: colors.ink },
  price: { fontSize: 22, fontWeight: '800', color: colors.accent },
  body: { fontSize: 15, lineHeight: 22, color: colors.ink },
  muted: { color: colors.muted },
  small: { color: colors.muted, fontSize: 12 },
  success: { gap: space(2), backgroundColor: '#EAF5EE', borderRadius: radius, padding: space(4) },
  successTitle: { fontSize: 18, fontWeight: '800', color: colors.ok },
});
