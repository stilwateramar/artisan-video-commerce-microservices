# Build from backend/: docker build -f services/catalog-service/Dockerfile .
FROM node:22-bookworm-slim
WORKDIR /app
COPY . .
RUN npm ci --workspace services/catalog-service --omit=dev
ENV NODE_ENV=production PORT=8080
CMD ["node", "services/catalog-service/src/index.js"]
