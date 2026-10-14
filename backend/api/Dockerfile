FROM node:22-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY src ./src
# Expo web build (copied in by infra/deploy.sh). Served from the same origin as the API.
COPY public ./public
ENV PORT=8080
CMD ["node", "src/index.js"]
