# Recording the demo videos

## 1. Architecture and GCP deployment

1. Walk through the diagram in `docs/ARCHITECTURE.md` and the repository layout.
2. Show the live project in the Cloud Console:
   - Cloud Run, Services, `artisan-api`: revisions, URL and request logs.
   - Cloud Run, Jobs, `artisan-transcoder`: execution history and the logs of a successful run. Do not
     press Execute on the job; it needs a product ID and fails without one.
   - Cloud Storage: the original upload in the raw bucket; `videos/<id>/master.m3u8`, the rendition
     folders and segments in the media bucket.
   - Firestore: a product moving `UPLOADING`, `QUEUED`, `PROCESSING`, `READY`, and an order document.
3. Show `backend/worker/src/ladder.js` and the measured 144p numbers in the README.

## 2. Android app at 40 kbps

Upload on a normal connection first; uploading a large video at 40 kbps would take hours.

```bash
# Install the release build on the emulator (or a phone with USB debugging)
adb install app-release.apk

# Start the bandwidth limiter on the Mac and route the emulator through it
node tools/throttle-proxy.mjs 40
adb shell settings put global http_proxy 10.0.2.2:8899

# Afterwards
adb shell settings put global http_proxy :0
```

We use the proxy rather than `adb emu network speed`: recent emulators send traffic over virtual
Wi-Fi, which that command does not throttle. The proxy prints the real throughput every 10 seconds,
which is useful to show on screen next to the emulator.

Record with the emulator's screen recorder or `adb shell screenrecord /sdcard/demo.mp4`.

Flow: sign in as an artisan, upload a video, wait for READY, sign out. Start the proxy. Sign in as a
buyer, search, open the product and press play. The overlay should show 144p, an estimate around
40 kbps and 0 stalls. Place the order, then open My orders.

Record the tablet layout on the Pixel Tablet emulator as well: four columns in landscape, three in
portrait, and the product page with video and details side by side.

## 3. Chrome

In DevTools, Network, Throttling, add a custom profile: 40 kbps download, 40 kbps upload, 300 ms
latency. Do the upload without throttling, then select the profile before opening the product page.
Keep the Network panel visible to show the 4-second segments of about 18 KB, and the stats overlay.
Keep the tab in the foreground; Chrome slows down background tabs, which can stall hls.js.
