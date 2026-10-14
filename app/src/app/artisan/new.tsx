import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Field, Screen } from '../../components/ui';
import { api } from '../../lib/api';
import { bytes, duration } from '../../lib/format';
import { pickVideo, type PickedVideo } from '../../lib/pickVideo';
import { colors, radius, space } from '../../lib/theme';
import { uploadToSession } from '../../lib/upload';

export default function NewProduct() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [tags, setTags] = useState('');
  const [video, setVideo] = useState<PickedVideo | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [phase, setPhase] = useState<'idle' | 'uploading' | 'finalizing'>('idle');
  const [error, setError] = useState('');

  const valid = title.trim() && Number(price) > 0 && video;

  async function choose() {
    setError('');
    try {
      const v = await pickVideo();
      if (v) setVideo(v);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function submit() {
    if (!video) return;
    setError('');
    setPhase('uploading');
    setProgress(0);
    try {
      const { product, uploadUrl } = await api.createProduct({
        title: title.trim(),
        description: description.trim(),
        price: Number(price),
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        fileName: video.fileName,
        contentType: video.mimeType,
        fileSize: video.fileSize,
        durationSec: video.durationSec,
      });
      await uploadToSession(uploadUrl, video, (sent, total) => setProgress(total ? sent / total : 0));
      setPhase('finalizing');
      await api.completeUpload(product.id);
      router.replace('/artisan');
    } catch (e: any) {
      setError(e.message || String(e));
      setPhase('idle');
      setProgress(null);
    }
  }

  const busy = phase !== 'idle';
  return (
    <Screen>
      <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
        <Pressableish onPress={busy ? undefined : choose} video={video} />
        <Field
          label="Product title"
          value={title}
          onChangeText={setTitle}
          placeholder="Hand-thrown terracotta vase"
          editable={!busy}
        />
        <Field
          label="Description"
          value={description}
          onChangeText={setDescription}
          multiline
          placeholder="Materials, size, how it's made…"
          editable={!busy}
        />
        <Field
          label="Price (₹)"
          value={price}
          onChangeText={setPrice}
          keyboardType="decimal-pad"
          placeholder="1499"
          editable={!busy}
        />
        <Field
          label="Tags (comma separated)"
          value={tags}
          onChangeText={setTags}
          placeholder="pottery, terracotta, home decor"
          autoCapitalize="none"
          editable={!busy}
        />
        {progress !== null && (
          <View style={{ gap: 6 }}>
            <View style={s.bar}>
              <View style={[s.fill, { width: `${Math.round(progress * 100)}%` }]} />
            </View>
            <Text style={s.muted}>
              {phase === 'finalizing' ? 'Starting transcoding…' : `Uploading ${Math.round(progress * 100)}%`}
            </Text>
          </View>
        )}
        {!!error && <Text style={{ color: colors.danger }}>{error}</Text>}
        <Button title="Publish product" onPress={submit} disabled={!valid} loading={busy} />
        <Text style={s.muted}>
          Videos up to 15 minutes, any file size. After upload we create low-bandwidth versions so buyers on
          slow networks can watch smoothly.
        </Text>
      </ScrollView>
    </Screen>
  );
}

function Pressableish({ onPress, video }: { onPress?: () => void; video: PickedVideo | null }) {
  return (
    <View style={s.pick}>
      <Text style={{ fontWeight: '700', color: colors.ink }}>
        {video ? video.fileName : 'No video selected'}
      </Text>
      {video && (
        <Text style={s.muted}>
          {[duration(video.durationSec), bytes(video.fileSize)].filter(Boolean).join(' · ')}
        </Text>
      )}
      <Button
        title={video ? 'Change video' : 'Choose process video'}
        variant="ghost"
        onPress={onPress}
        disabled={!onPress}
      />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { padding: space(4), gap: space(4), maxWidth: 640, width: '100%', alignSelf: 'center' },
  pick: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.accent,
    borderRadius: radius,
    padding: space(4),
    gap: space(2),
    backgroundColor: '#fff',
  },
  muted: { color: colors.muted, fontSize: 13 },
  bar: { height: 8, backgroundColor: colors.border, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, backgroundColor: colors.accent },
});
