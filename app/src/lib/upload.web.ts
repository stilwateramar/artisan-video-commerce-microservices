// Chunked upload to a GCS resumable session. GCS requires chunks in multiples of
// 256 KiB. After a network error we ask GCS how many bytes it has and resume there,
// so a multi-GB upload survives a flaky connection.
import type { PickedVideo } from './pickVideo';

const CHUNK = 8 * 1024 * 1024; // 8 MiB

function put(url: string, body: Blob | null, range: string, onChunkProgress?: (n: number) => void) {
  return new Promise<{ status: number; range: string | null }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Range', range);
    if (xhr.upload && onChunkProgress) xhr.upload.onprogress = (e) => onChunkProgress(e.loaded);
    xhr.onload = () => resolve({ status: xhr.status, range: xhr.getResponseHeader('Range') });
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.send(body);
  });
}

async function queryOffset(url: string, total: number) {
  const r = await put(url, null, `bytes */${total}`);
  if (r.status === 200 || r.status === 201) return total;
  return r.range ? Number(r.range.split('-')[1]) + 1 : 0;
}

export async function uploadToSession(
  sessionUrl: string,
  video: PickedVideo,
  onProgress: (sent: number, total: number) => void,
) {
  const blob = video.webFile;
  if (!blob) throw new Error('No file selected');
  const total = blob.size;
  let offset = 0;
  let retries = 0;

  while (offset < total) {
    const end = Math.min(offset + CHUNK, total);
    try {
      const r = await put(sessionUrl, blob.slice(offset, end), `bytes ${offset}-${end - 1}/${total}`, (n) =>
        onProgress(offset + n, total),
      );
      if (r.status === 200 || r.status === 201) {
        offset = total;
        break;
      }
      if (r.status === 308) {
        offset = r.range ? Number(r.range.split('-')[1]) + 1 : 0;
        retries = 0;
        continue;
      }
      throw new Error('Upload failed');
    } catch (e) {
      if (++retries > 8) throw e;
      await new Promise((res) => setTimeout(res, Math.min(30000, 1000 * 2 ** retries)));
      offset = await queryOffset(sessionUrl, total).catch(() => offset);
    }
    onProgress(offset, total);
  }
  onProgress(total, total);
}
