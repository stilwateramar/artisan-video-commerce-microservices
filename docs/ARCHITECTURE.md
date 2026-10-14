# Architecture

This describes the data flow and the video pipeline, which are the same in both versions. For how
the backend is split into services, events and IAM, see [MICROSERVICES.md](MICROSERVICES.md).

```
  Android app (phone, tablet)          Chrome
  ExoPlayer via react-native-video     hls.js
             \                          /
              \   HTTPS: JSON + HLS    /
               v                      v
        +------------------------------------+
        | Cloud Run service: artisan-api     |   also serves the web build
        |  /api: auth, products, orders      |
        |  /media: streams HLS from GCS      |
        +------------------------------------+
          |              |               ^
          | resumable    | runJob        | read playlists, segments
          | upload URL   v               |
          |   +--------------------------------+
          |   | Cloud Run Job: transcoder      |   ffprobe, ffmpeg ladder,
          |   | 4 vCPU, 8 GiB, 60 min timeout  |   upload, mark READY
          |   +--------------------------------+
          |        | signed URL         | write
          v        v                    v
   +----------------------+    +----------------------+
   | GCS raw (private)    |    | GCS media (private)  |
   | client PUTs here     |    | master.m3u8, fMP4    |
   +----------------------+    +----------------------+

   Firestore: users, products (status, searchTokens, hlsUrl), orders
```

## Upload

1. The app calls `POST /api/products` with the product details. The API creates the product in
   `UPLOADING` state and a Cloud Storage resumable upload session.
2. The app uploads the file directly to Cloud Storage, so the API never handles video bytes and there is
   no size limit. The web app sends 8 MiB chunks and resumes after network errors; Android sends one
   streaming PUT from disk.
3. The app calls `POST /api/products/:id/complete`. The API checks the object exists, sets the product to
   `QUEUED` and starts the Cloud Run Job.
4. The 15-minute limit is checked when the file is picked and again by ffprobe in the job.

## Transcoding

- ffmpeg reads the raw file through a signed URL, so a multi-GB upload never needs local disk.
- One ffmpeg pass splits the input into four renditions with closed 4-second GOPs and writes HLS v7
  with fMP4 segments.
- Scaling uses the short side, so portrait phone videos get the same resolutions as landscape ones.
- Segments are uploaded with year-long immutable cache headers, playlists with 60 seconds.

| Rung | Video                           | Audio             | Measured total     |
| ---- | ------------------------------- | ----------------- | ------------------ |
| 144p | H.264 baseline, 12 fps, 22 kbps | Opus mono 12 kbps | 35.4-36.6 kbps avg |
| 240p | H.264 main, 15 fps, 110 kbps    | Opus mono 24 kbps | about 135 kbps     |
| 360p | H.264 main, 24 fps, 350 kbps    | Opus 32 kbps      | about 380 kbps     |
| 720p | H.264 main, 24 fps, 1400 kbps   | Opus 64 kbps      | about 1.45 Mbps    |

The 144p budget is what keeps the lowest rung under 50 kbps: 22 kbps of video at 12 fps is still
watchable for a craft video, and Opus at 12 kbps mono keeps speech clear. Container overhead brings
the total to about 36 kbps, and the largest 4-second segment we have measured is 40.7 kbps.

## Media delivery

Both buckets are private. Our GCP organisation enforces domain-restricted sharing, which rejects
`allUsers` bindings, so the media bucket cannot be made public. The API's `/media/videos/<id>/...` route
streams objects from the bucket instead. It passes through the cache headers, supports Range and ETag
requests, and allows any origin. The service itself is made public with Cloud Run's
`--no-invoker-iam-check`, since the same policy blocks an `allUsers` invoker binding.

At these bitrates Cloud Run handles the traffic easily. With more users we would put Cloud CDN in front
of `/media`.

## Playback under 50 kbps

- Both players start on the 144p rung and move up only after measuring more bandwidth.
- At 40 kbps a 4-second 144p segment (about 18 KB) downloads in under 4 seconds, so the buffer grows
  slowly but steadily once playback starts.
- react-native-video shares one bandwidth meter across players, which carried a fast-network estimate
  into later playbacks. The app gives each player a fresh 40 kbps estimate to avoid starting on 720p.

## Search

Each product stores `searchTokens`: the words of its title, description and tags plus their prefixes.
A search runs one `array-contains` query on the first term and filters the rest in memory, which needs
no composite index. A larger catalogue would need a real search service such as Algolia.

## Not built for this demo

Cloud CDN in front of `/media`, Firebase Auth instead of the demo sign-in, Pub/Sub status events, real
payments, and signed cookies for media.
