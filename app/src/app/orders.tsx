import { useEffect, useState } from 'react';
import { FlatList, Image, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../components/ui';
import { api } from '../lib/api';
import { money } from '../lib/format';
import { colors, radius, space } from '../lib/theme';
import type { Order } from '../lib/types';

export default function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    api
      .myOrders()
      .then((r) => setOrders(r.orders))
      .catch((e) => setError(e.message));
  }, []);
  return (
    <Screen>
      <FlatList
        data={orders}
        keyExtractor={(o) => o.id}
        contentContainerStyle={{
          padding: space(4),
          gap: space(3),
          maxWidth: 800,
          width: '100%',
          alignSelf: 'center',
        }}
        ListEmptyComponent={
          <Text style={{ color: colors.muted, textAlign: 'center' }}>{error || 'No orders yet.'}</Text>
        }
        renderItem={({ item: o }) => (
          <View style={s.row}>
            <View style={s.thumb}>
              {o.thumbnailUrl ? (
                <Image source={{ uri: o.thumbnailUrl }} style={StyleSheet.absoluteFill} />
              ) : null}
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontWeight: '700', color: colors.ink }}>{o.productTitle}</Text>
              <Text style={{ color: colors.muted }}>
                #{o.id.slice(-6).toUpperCase()} · qty {o.quantity} ·{' '}
                {o.createdAt ? new Date(o.createdAt).toLocaleString() : ''}
              </Text>
              <Text style={{ fontWeight: '700' }}>
                {money(o.totalMinor, o.currency)} · {o.status}
              </Text>
            </View>
          </View>
        )}
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: space(3),
    backgroundColor: '#fff',
    padding: space(3),
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.border,
  },
  thumb: { width: 72, height: 54, borderRadius: 6, backgroundColor: '#E9E1D8', overflow: 'hidden' },
});
