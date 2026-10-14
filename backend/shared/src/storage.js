// Object storage with two backends: Cloud Storage in production, a local folder for development
// (STORAGE_MODE=local). Both expose the same small interface used by catalog, media and worker.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Storage } from '@google-cloud/storage';

const CONTENT_TYPES = {
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.m4s': 'video/iso.segment',
  '.mp4': 'video/mp4',
  '.jpg': 'image/jpeg',
};

export function contentHeaders(file) {
  const ext = path.extname(file);
  const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';
  // Segments never change once written; playlists are short-lived so a re-transcode shows up.
  const cacheControl =
    ext === '.m4s' || ext === '.mp4'
      ? 'public, max-age=31536000, immutable'
      : ext === '.jpg'
        ? 'public, max-age=86400'
        : 'public, max-age=60';
  return { contentType, cacheControl };
}

export function createStorage({
  mode = process.env.STORAGE_MODE || 'gcs',
  localDir = process.env.LOCAL_STORAGE_DIR,
} = {}) {
  return mode === 'local' ? localFolderStorage(localDir) : gcsStorage();
}

function gcsStorage() {
  const gcs = new Storage();
  const file = (bucket, name) => gcs.bucket(bucket).file(name);
  return {
    mode: 'gcs',
    async createUploadSession(bucket, name, { contentType, origin }) {
      // GCS only returns CORS headers on the session URL if it was created with the page's origin.
      const [url] = await file(bucket, name).createResumableUpload({ metadata: { contentType }, origin });
      return url;
    },
    async exists(bucket, name) {
      const [found] = await file(bucket, name).exists();
      return found;
    },
    async stat(bucket, name) {
      try {
        const [meta] = await file(bucket, name).getMetadata();
        return {
          size: Number(meta.size),
          contentType: meta.contentType,
          cacheControl: meta.cacheControl,
          etag: meta.etag,
        };
      } catch (e) {
        if (e.code === 404) return null;
        throw e;
      }
    },
    read: (bucket, name, { start, end }) =>
      file(bucket, name).createReadStream({ start, end, validation: false }),
    async readUrl(bucket, name) {
      const [url] = await file(bucket, name).getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + 3 * 3600_000,
      });
      return url;
    },
    async upload(bucket, name, localPath) {
      await gcs
        .bucket(bucket)
        .upload(localPath, { destination: name, metadata: contentHeaders(localPath), resumable: false });
    },
  };
}

function localFolderStorage(root) {
  if (!root) throw new Error('LOCAL_STORAGE_DIR is not set');
  const full = (bucket, name) => {
    const p = path.resolve(root, bucket, name);
    if (!p.startsWith(path.resolve(root) + path.sep)) throw new Error('Invalid object path');
    return p;
  };
  return {
    mode: 'local',
    // The catalog serves the upload endpoint itself in local mode; see uploads.js there.
    async createUploadSession() {
      return null;
    },
    async exists(bucket, name) {
      return fs.existsSync(full(bucket, name));
    },
    async stat(bucket, name) {
      try {
        const s = await fsp.stat(full(bucket, name));
        return { size: s.size, ...contentHeaders(name), etag: `"${s.size}-${s.mtimeMs}"` };
      } catch {
        return null;
      }
    },
    read: (bucket, name, { start, end }) => fs.createReadStream(full(bucket, name), { start, end }),
    async readUrl(bucket, name) {
      return full(bucket, name);
    },
    async upload(bucket, name, localPath) {
      const dest = full(bucket, name);
      await fsp.mkdir(path.dirname(dest), { recursive: true });
      await fsp.copyFile(localPath, dest);
    },
    // Local mode only: where the catalog's upload endpoint writes incoming bytes.
    pathFor: full,
  };
}
