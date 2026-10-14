// Native: one streaming PUT from disk to the GCS resumable session. GCS accepts any
// size in a single request and the file is never loaded into JS memory.
import { File } from 'expo-file-system';
import type { PickedVideo } from './pickVideo';

export async function uploadToSession(
  sessionUrl: string,
  video: PickedVideo,
  onProgress: (sent: number, total: number) => void,
) {
  const file = new File(video.uri);
  const result = await file.upload(sessionUrl, {
    httpMethod: 'PUT',
    headers: { 'Content-Type': video.mimeType },
    onProgress: ({ bytesSent, totalBytes }) => onProgress(bytesSent, totalBytes),
  });
  if (result.status < 200 || result.status >= 300) {
    throw new Error('Upload failed, please try again');
  }
}
