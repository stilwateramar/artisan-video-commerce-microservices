# Build from backend/: docker build -f worker/Dockerfile .
FROM node:22-bookworm-slim
# Debian's ffmpeg includes libx264 and libopus, which the ladder needs.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
RUN npm ci --workspace worker --omit=dev
ENV NODE_ENV=production
CMD ["node", "worker/src/transcode.js"]
