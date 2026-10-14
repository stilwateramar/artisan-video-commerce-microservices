# Build from backend/: docker build -f services/media-service/Dockerfile .
FROM node:22-bookworm-slim
WORKDIR /app
COPY . .
RUN npm ci --workspace services/media-service --omit=dev
ENV NODE_ENV=production PORT=8080
CMD ["node", "services/media-service/src/index.js"]
