FROM node:22-bookworm-slim
# Debian's ffmpeg includes libx264 + libopus, which the ladder needs.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY src ./src
CMD ["node", "src/transcode.js"]
