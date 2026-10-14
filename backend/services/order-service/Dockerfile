# Build from backend/: docker build -f services/order-service/Dockerfile .
FROM node:22-bookworm-slim
WORKDIR /app
COPY . .
RUN npm ci --workspace services/order-service --omit=dev
ENV NODE_ENV=production PORT=8080
CMD ["node", "services/order-service/src/index.js"]
