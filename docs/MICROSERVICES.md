# Microservices design

This is the microservices version of the platform. It has the same public API and the same
apps as the monolith; only the backend is split. It is deployed next to the monolith demo:

- Microservices: https://artisan-ms-gateway-398082391608.asia-south1.run.app
- Monolith (unchanged): https://artisan-api-398082391608.asia-south1.run.app

## Services

```
                      Android app / Chrome
                               |
                               v
        +------------------------------------------------+
        | gateway (public)                                |  serves the web build
        |  /api/auth -> auth   /api/products -> catalog   |
        |  /api/orders -> order   /media -> media         |
        +------------------------------------------------+
            |              |               |          |
            v              v               v          v
     +-----------+  +--------------+  +---------+  +-------+
     | auth      |  | catalog      |  | order   |  | media |
     | users     |  | products     |<-| orders  |  |       |
     +-----------+  +--------------+  +---------+  +-------+
                       |      ^    GET /internal/     | read
             runJob    |      |    products/:id      v
                       v      | push           GCS media bucket
              +-----------------+   video-events (Pub/Sub)
              | transcoder job  |-----------------^
              +-----------------+  publish
                 | read raw, write HLS
                 v
            GCS raw / media buckets
```

| Service         | Owns       | Responsibilities                                                                                                     |
| --------------- | ---------- | -------------------------------------------------------------------------------------------------------------------- |
| gateway         | -          | Only public service. Routes the monolith's paths, serves the web build.                                              |
| auth-service    | `users`    | Demo sign-in, issues JWTs.                                                                                           |
| catalog-service | `products` | Create products, upload sessions, search, tags, start the transcoder, consume video events, internal product lookup. |
| order-service   | `orders`   | Place and list orders. Reads product price and status only from catalog-service.                                     |
| media-service   | -          | Streams HLS playlists, segments and posters from the media bucket (Range, ETag, cache headers).                      |
| transcoder job  | -          | ffmpeg ladder, upload to the media bucket, publish `video.*` events. No database access.                             |

Shared code lives in `backend/shared` (an npm workspace): config, JWT signing and checking, Secret
Manager loading, JSON logging, error handling, service-to-service ID tokens, and the storage layer.

## Events

The transcoder publishes to the `video-events` topic:

| Type               | Fields                                         |
| ------------------ | ---------------------------------------------- |
| `video.processing` | `eventId`, `productId`, `occurredAt`           |
| `video.ready`      | plus `hlsPath`, `thumbnailPath`, `durationSec` |
| `video.failed`     | plus `error` (short, user-facing)              |

A push subscription delivers them to `catalog-service` at `POST /events/video`. Pub/Sub delivers at
least once and can reorder, so the handler is idempotent:

- Each event is applied in a Firestore transaction that also creates `products/{id}/events/{eventId}`.
  A redelivered event finds that document and is skipped.
- Status only moves forward: `QUEUED -> PROCESSING -> READY | FAILED`, and `FAILED -> READY` for a
  retried job. A late `video.processing` or `video.failed` after `READY` is recorded and ignored.
- Malformed and unknown events are acknowledged (204) so they are not redelivered forever; real errors
  return 500 and Pub/Sub retries with backoff.

Media is stored by path (`videos/<id>/master.m3u8`). Services build absolute URLs per request from the
`X-Forwarded-Host` header the gateway sets, so links always match the host the client used.

## Running next to the live demo

`deploy-microservices.sh` can target the same GCP project as the monolith demo without affecting it.
Every resource has its own name, and the data lives in a separate Firestore database:

| Resource         | Monolith demo (unchanged)             | Microservices                                        |
| ---------------- | ------------------------------------- | ---------------------------------------------------- |
| Public URL       | `artisan-api-...run.app`              | `artisan-ms-gateway-...run.app`                      |
| Cloud Run        | `artisan-api`                         | `artisan-ms-gateway`, `artisan-ms-<name>-service` x4 |
| Transcoder job   | `artisan-transcoder`                  | `artisan-ms-transcoder`                              |
| Buckets          | `<project>-artisan-raw`, `-media`     | `<project>-artisan-ms-raw`, `-artisan-ms-media`      |
| Firestore        | `(default)` database                  | `artisan-ms` database                                |
| Service accounts | `artisan-api-sa`, `artisan-worker-sa` | `ams-<name>`                                         |
| Secret, topic    | none                                  | `artisan-ms-jwt-secret`, `artisan-ms-video-events`   |

The only project-wide change is two roles for the default compute service account that Cloud Build
uses, which the monolith deploy already needs. The Android APK has the API address built in, so a
build that should talk to the microservices gateway needs `EXPO_PUBLIC_API_URL=<gateway url>`.

## Security

- **Public surface:** only the gateway. It is made public with `--no-invoker-iam-check`, because our
  organisation's domain-restricted sharing rejects `allUsers` bindings.
- **Internal services** are deployed with `--no-allow-unauthenticated`. The gateway, order-service and
  the Pub/Sub push identity call them with Google ID tokens, sent in `X-Serverless-Authorization` so
  the end user's `Authorization: Bearer <jwt>` header passes through unchanged. The gateway also
  refuses `/internal/*` and `/events/*`.
- **JWT secret:** stored in Secret Manager. Services get `JWT_SECRET_NAME` and read the secret at
  startup; locally `JWT_SECRET` comes from the environment.
- **One service account per service:**

| Account         | Permissions                                                                                               |
| --------------- | --------------------------------------------------------------------------------------------------------- |
| ams-gateway     | Invoker on auth, catalog, order, media                                                                    |
| ams-auth        | Firestore user, read the JWT secret                                                                       |
| ams-catalog     | Firestore user, read the JWT secret, object admin on the raw bucket, run the transcoder job as ams-worker |
| ams-order       | Firestore user, read the JWT secret, invoker on catalog                                                   |
| ams-media       | Object viewer on the media bucket                                                                         |
| ams-worker      | Object viewer on raw, object admin on media, publish to `video-events`, sign its own URLs                 |
| ams-pubsub-push | Invoker on catalog (push endpoint)                                                                        |

Firestore access is granted only on the `artisan-ms` database, through an IAM condition. Firestore IAM
does not go below the database level, so within it the three services share `roles/datastore.user`
and collection ownership is enforced in code.

## Trade-offs compared with the monolith

- Placing an order is no longer one Firestore transaction across product and order: order-service reads
  the product from catalog, then writes the order. Price is copied onto the order, so a later price
  change cannot alter it. A product taken offline between the read and the write could still be
  ordered; the monolith's transaction prevented that.
- Each request through the gateway is one extra network hop, and each internal call needs an ID token
  (cached per audience).
- Five services and a topic to deploy and monitor instead of one service.

## Running locally

`docker compose up --build` (or `npm run dev`) starts everything with the Firestore and Pub/Sub
emulators; open http://localhost:8080. Without Docker, `npm run dev:native` runs the same stack with
Node and the gcloud emulators (needs Java 21 and the `cloud-firestore-emulator` and `pubsub-emulator`
components). Video files go to `.local-storage/`, and the catalog accepts uploads itself using the
same protocol as a GCS resumable session, so the apps need no changes. Set `STORAGE_MODE=gcs` with
real bucket names to use Cloud Storage instead.

| Port | Process                         |
| ---- | ------------------------------- |
| 8080 | gateway                         |
| 8081 | auth-service                    |
| 8082 | catalog-service                 |
| 8083 | order-service                   |
| 8084 | media-service                   |
| 8085 | transcoder dev server (local)   |
| 8686 | Firestore emulator (native run) |
| 8681 | Pub/Sub emulator (native run)   |

## What has been verified

With `npm run dev:native` (Node processes and gcloud emulators; Docker was not available):

- All health endpoints respond; the gateway serves the web app.
- Artisan sign-in, product creation, an 8 MiB chunked upload with a resume probe (308 and `Range`
  as from GCS), and a single-PUT upload. The stored file was byte-identical to the original.
- The transcoder published `video.processing` and `video.ready`; the push subscription delivered
  them to catalog-service and the product became READY about 8 seconds after `complete`.
- Playlists, a ranged segment request and the poster through the gateway; search, tag filter, an
  order (order-service calling catalog-service), and the order list.
- Role checks (an artisan cannot order), unknown product (404), `/internal` and `/events` refused by
  the gateway.
- A duplicate `video.ready` was skipped, late `processing` and `failed` events did not change a READY
  product, and a malformed message was acknowledged and ignored.
- An invalid file ended FAILED with "The file could not be read as a video".
- With `FIRESTORE_DATABASE=artisan-ms`, a full upload-to-order run wrote all users, products and
  orders to that database and nothing to `(default)`.

Not verified: `docker compose` (Docker was not installed), anything on GCP (the deploy script has not
been run), the ID-token and Secret Manager code paths (they only activate on Cloud Run), and the apps
against this backend (the API is unchanged, so they should work as-is).
