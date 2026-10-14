// Web: hls.js. startLevel 0 and a 40 kbps initial estimate start playback on 144p;
// the low up-switch factor makes ABR climb only when bandwidth is clearly available;
// long fragment timeouts are needed because a 4 s segment takes about 4 s at 40 kbps.
import Hls from 'hls.js';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { PlaybackStats, type Stats } from './PlaybackStats';

type Props = { hlsUrl: string; posterUrl?: string; showStats?: boolean; autoPlay?: boolean };

export function VideoPlayer({ hlsUrl, posterUrl, showStats = true, autoPlay = false }: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const [stats, setStats] = useState<Stats>({ stalls: 0, state: 'loading' });

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    let started = false;
    let hls: Hls | null = null;

    if (Hls.isSupported()) {
      hls = new Hls({
        startLevel: 0,
        abrEwmaDefaultEstimate: 40_000,
        abrBandWidthFactor: 0.85,
        abrBandWidthUpFactor: 0.6,
        capLevelToPlayerSize: true,
        maxBufferLength: 30,
        maxMaxBufferLength: 120,
        backBufferLength: 30,
        fragLoadPolicy: {
          default: {
            maxTimeToFirstByteMs: 20_000,
            maxLoadTimeMs: 90_000,
            timeoutRetry: { maxNumRetry: 4, retryDelayMs: 0, maxRetryDelayMs: 0 },
            errorRetry: { maxNumRetry: 6, retryDelayMs: 1000, maxRetryDelayMs: 8000 },
          },
        },
      });
      hls.loadSource(hlsUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.LEVEL_SWITCHED, (_e, d) => {
        const l = hls!.levels[d.level];
        // Use the short side so portrait renditions are labelled like the ladder (144p).
        setStats((p) => ({
          ...p,
          levelLabel: `${Math.min(l.width, l.height) || l.height}p · ${Math.round(l.bitrate / 1000)} kbps`,
        }));
      });
      hls.on(Hls.Events.FRAG_LOADED, () =>
        setStats((p) => ({ ...p, estimateKbps: hls!.bandwidthEstimate / 1000 })),
      );
      hls.on(Hls.Events.ERROR, (_e, d) => {
        if (d.fatal) {
          if (d.type === Hls.ErrorTypes.NETWORK_ERROR) hls!.startLoad();
          else if (d.type === Hls.ErrorTypes.MEDIA_ERROR) hls!.recoverMediaError();
          setStats((p) => ({ ...p, state: `recovering (${d.details})` }));
        }
      });
    } else {
      video.src = hlsUrl; // native HLS fallback
    }

    const onWaiting = () =>
      setStats((p) => ({ ...p, state: 'buffering', stalls: started ? p.stalls + 1 : p.stalls }));
    const onPlaying = () => {
      started = true;
      setStats((p) => ({ ...p, state: 'playing' }));
    };
    const onPause = () => setStats((p) => ({ ...p, state: 'paused' }));
    const tick = setInterval(() => {
      const b = video.buffered;
      let ahead = 0;
      for (let i = 0; i < b.length; i++)
        if (b.start(i) <= video.currentTime && b.end(i) >= video.currentTime)
          ahead = b.end(i) - video.currentTime;
      setStats((p) => ({ ...p, bufferAheadSec: ahead }));
    }, 1000);

    video.addEventListener('waiting', onWaiting);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('pause', onPause);
    return () => {
      clearInterval(tick);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('pause', onPause);
      hls?.destroy();
    };
  }, [hlsUrl]);

  return (
    <View style={s.wrap}>
      <video
        ref={ref}
        poster={posterUrl}
        controls
        autoPlay={autoPlay}
        playsInline
        preload="metadata"
        style={{ width: '100%', height: '100%', backgroundColor: '#000', objectFit: 'contain' }}
      />
      {showStats && <PlaybackStats stats={stats} />}
    </View>
  );
}

const s = StyleSheet.create({ wrap: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000' } });
