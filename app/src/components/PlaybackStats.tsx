import { StyleSheet, Text, View } from 'react-native';

export type Stats = {
  estimateKbps?: number; // player's bandwidth estimate
  levelLabel?: string; // e.g. "144p · 37 kbps"
  bufferAheadSec?: number;
  stalls: number; // rebuffer events after first frame
  state: string; // loading | playing | buffering | paused | error
};

// On-screen playback stats, used to show low-bandwidth behaviour in the demo recordings.
export function PlaybackStats({ stats }: { stats: Stats }) {
  return (
    <View pointerEvents="none" style={s.box}>
      <Text style={s.t}>state: {stats.state}</Text>
      <Text style={s.t}>rendition: {stats.levelLabel ?? '–'}</Text>
      <Text style={s.t}>net est: {stats.estimateKbps ? `${Math.round(stats.estimateKbps)} kbps` : '–'}</Text>
      {stats.bufferAheadSec !== undefined && (
        <Text style={s.t}>buffer: {stats.bufferAheadSec.toFixed(1)} s</Text>
      )}
      <Text style={s.t}>stalls: {stats.stalls}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  box: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 6,
    borderRadius: 6,
  },
  t: { color: '#9CFF9C', fontSize: 11, fontFamily: 'monospace' },
});
