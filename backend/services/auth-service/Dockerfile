# Build from backend/: docker build -f services/auth-service/Dockerfile .
FROM node:22-bookworm-slim
WORKDIR /app
COPY . .
RUN npm ci --workspace services/auth-service --omit=dev
ENV NODE_ENV=production PORT=8080
CMD ["node", "services/auth-service/src/index.js"]
