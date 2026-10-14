import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { colors, radius, space } from '../lib/theme';

export function Screen({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[{ flex: 1, backgroundColor: colors.bg }, style]}>{children}</View>;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
}: {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
}) {
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        b.base,
        primary ? b.primary : b.ghost,
        (disabled || loading) && { opacity: 0.5 },
        pressed && { opacity: 0.8 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={primary ? colors.accentInk : colors.accent} />
      ) : (
        <Text style={[b.text, { color: primary ? colors.accentInk : colors.accent }]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: space(1) }}>
      <Text style={{ color: colors.muted, fontSize: 13, fontWeight: '600' }}>{label}</Text>
      <TextInput
        placeholderTextColor="#A99E95"
        {...props}
        style={[b.input, props.multiline && { minHeight: 90, textAlignVertical: 'top' }, props.style]}
      />
    </View>
  );
}

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[b.chip, active && { backgroundColor: colors.ink, borderColor: colors.ink }]}
    >
      <Text style={{ color: active ? '#fff' : colors.ink, fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

export function StatusPill({ status }: { status: string }) {
  const c = status === 'READY' ? colors.ok : status === 'FAILED' ? colors.danger : colors.warn;
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 2,
        backgroundColor: c + '22',
      }}
    >
      <Text style={{ color: c, fontSize: 12, fontWeight: '700' }}>{status}</Text>
    </View>
  );
}

const b = StyleSheet.create({
  base: {
    paddingVertical: space(3),
    paddingHorizontal: space(5),
    borderRadius: radius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: colors.accent },
  ghost: { borderWidth: 1, borderColor: colors.accent },
  text: { fontSize: 16, fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#fff',
    borderRadius: radius,
    padding: space(3),
    fontSize: 16,
    color: colors.ink,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#fff',
  },
});
