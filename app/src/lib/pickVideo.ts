import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

export const MAX_SECONDS = 15 * 60;

export type PickedVideo = {
  uri: string;
  fileName: string;
  mimeType: string;
  fileSize?: number;
  durationSec?: number;
  webFile?: Blob; // web only
};

function webDuration(file: Blob): Promise<number | undefined> {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => {
      resolve(Number.isFinite(v.duration) ? v.duration : undefined);
      URL.revokeObjectURL(v.src);
    };
    v.onerror = () => resolve(undefined);
    v.src = URL.createObjectURL(file);
  });
}

export async function pickVideo(): Promise<PickedVideo | null> {
  if (Platform.OS !== 'web') {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) throw new Error('Allow access to videos to pick one');
  }
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['videos'],
    allowsEditing: false,
    quality: 1,
  });
  if (res.canceled || !res.assets?.length) return null;
  const a = res.assets[0];
  const picked: PickedVideo = {
    uri: a.uri,
    fileName: a.fileName || `process-${Date.now()}.mp4`,
    mimeType: a.mimeType || 'video/mp4',
    fileSize: a.fileSize ?? a.file?.size,
    // expo-image-picker reports milliseconds on Android but seconds on web, so on web
    // we read the duration from the file ourselves.
    durationSec: Platform.OS !== 'web' && a.duration ? a.duration / 1000 : undefined,
    webFile: a.file,
  };
  if (Platform.OS === 'web' && a.file) picked.durationSec = await webDuration(a.file);
  if (picked.durationSec && picked.durationSec > MAX_SECONDS + 1) {
    throw new Error(
      `This video is ${Math.round(picked.durationSec / 60)} min long. Please pick one that is 15 minutes or shorter.`,
    );
  }
  return picked;
}
