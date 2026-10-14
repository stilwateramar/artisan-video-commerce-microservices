// Android: ExoPlayer (Media3) through react-native-video.
// We start from a 40 kbps bandwidth estimate so playback begins on the 144p rung and
// only moves up once ExoPlayer has measured more bandwidth; starting high on a slow
// link means a long initial stall. A short bufferForPlayback gets the first frame up
// quickly, and the large max buffer rides out short network dips.
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Video from 'react-native-video';
import { PlaybackStats, type Stats } from './PlaybackStats';

type Props = { hlsUrl: string; posterUrl?: string; showStats?: boolean; autoPlay?: boolean };

// react-native-video keeps one bandwidth meter for the whole app and only rebuilds it
// when initialBitrate changes, so an estimate from a fast network carried over and a
// later playback on a 40 kbps link started on 720p. A slightly different value per
// mount gives every playback a fresh 40 kbps estimate, the same as hls.js on web.
let mountSeq = 0;

export function VideoPlayer({ hlsUrl, posterUrl, showStats = true, autoPlay = false }: Props) {
  const [initialBitrate] = useState(() => 40_000 + (++mountSeq % 500));
  const played = useRef(false);
  const playing = useRef(false);
  const [stats, setStats] = useState<Stats>({ stalls: 0, state: 'loading' });

  return (
    <View style={s.wrap}>
      <Video
        style={StyleSheet.absoluteFill}
        source={{
          uri: hlsUrl,
          type: 'm3u8',
          bufferConfig: {
            initialBitrate,
            minBufferMs: 15_000,
            maxBufferMs: 90_000,
            bufferForPlaybackMs: 2_000,
            bufferForPlaybackAfterRebufferMs: 4_000,
          },
          minLoadRetryCount: 10,
        }}
        poster={posterUrl ? { source: { uri: posterUrl }, resizeMode: 'contain' } : undefined}
        resizeMode="contain"
        controls
        paused={!autoPlay}
        reportBandwidth
        progressUpdateInterval={1000}
        onBandwidthUpdate={(e) =>
          setStats((p) => ({
            ...p,
            estimateKbps: e.bitrate / 1000,
            levelLabel: e.height
              ? `${Math.round(e.width ? Math.min(e.width, e.height) : e.height)}p`
              : p.levelLabel,
          }))
        }
        onProgress={({ currentTime, playableDuration }) => {
          if (currentTime > 0.5) played.current = true;
          setStats((p) => ({ ...p, bufferAheadSec: Math.max(0, playableDuration - currentTime) }));
        }}
        onBuffer={({ isBuffering }) =>
          setStats((p) => ({
            ...p,
            state: isBuffering ? 'buffering' : playing.current ? 'playing' : 'paused',
            // Buffering before the first frames play is startup, not a stall.
            stalls: isBuffering && played.current && p.state !== 'buffering' ? p.stalls + 1 : p.stalls,
          }))
        }
        onPlaybackStateChanged={({ isPlaying }) => {
          playing.current = isPlaying;
          setStats((p) => ({
            ...p,
            state: isPlaying ? 'playing' : p.state === 'buffering' ? 'buffering' : 'paused',
          }));
        }}
        onEnd={() => setStats((p) => ({ ...p, state: 'ended' }))}
        onError={(e) => setStats((p) => ({ ...p, state: `error: ${JSON.stringify(e.error).slice(0, 80)}` }))}
      />
      {showStats && <PlaybackStats stats={stats} />}
    </View>
  );
}

const s = StyleSheet.create({ wrap: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000' } });
