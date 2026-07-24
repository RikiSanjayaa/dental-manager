FROM node:22-bookworm-slim

WORKDIR /app
COPY backend-worker/package.json backend-worker/package-lock.json ./
RUN npm ci
COPY backend-worker/ ./
COPY backend-worker/docker-entrypoint.sh /usr/local/bin/dental-worker-entrypoint
RUN chmod +x /usr/local/bin/dental-worker-entrypoint

EXPOSE 8787
ENTRYPOINT ["dental-worker-entrypoint"]
