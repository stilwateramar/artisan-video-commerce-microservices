import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { duration, money } from '../lib/format';
import { colors, radius, space } from '../lib/theme';
import type { Product } from '../lib/types';

export function ProductCard({ p, onPress, width }: { p: Product; onPress: () => void; width: number }) {
  return (
    <Pressable onPress={onPress} style={[s.card, { width }]}>
      <View style={s.thumb}>
        {p.thumbnailUrl ? (
          <Image source={{ uri: p.thumbnailUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : null}
        {p.durationSec ? <Text style={s.dur}>▶ {duration(p.durationSec)}</Text> : null}
      </View>
      <View style={{ padding: space(3), gap: 4 }}>
        <Text numberOfLines={2} style={s.title}>
          {p.title}
        </Text>
        <Text style={s.by}>by {p.artisanName}</Text>
        <Text style={s.price}>{money(p.priceMinor, p.currency)}</Text>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  thumb: { aspectRatio: 4 / 3, backgroundColor: '#E9E1D8' },
  dur: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    color: '#fff',
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 6,
    borderRadius: 4,
    fontSize: 12,
  },
  title: { fontSize: 15, fontWeight: '700', color: colors.ink },
  by: { fontSize: 12, color: colors.muted },
  price: { fontSize: 15, fontWeight: '700', color: colors.accent },
});
