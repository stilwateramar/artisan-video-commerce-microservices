# Build from backend/: docker build -f services/gateway/Dockerfile .
FROM node:22-bookworm-slim
WORKDIR /app
COPY . .
RUN npm ci --workspace services/gateway --omit=dev
ENV NODE_ENV=production PORT=8080
CMD ["node", "services/gateway/src/index.js"]
