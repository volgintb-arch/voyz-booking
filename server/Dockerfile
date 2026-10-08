# Build from the repository root (the server reuses ../src/domain):
#   docker build -f server/Dockerfile -t voyz-booking-server .
FROM node:22-alpine AS build
WORKDIR /app
COPY server/package.json server/package-lock.json server/
RUN cd server && npm ci
COPY src/ src/
COPY server/ server/
RUN cd server && npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app/server
ENV NODE_ENV=production
COPY --from=build /app/server/package.json ./
COPY --from=build /app/server/node_modules ./node_modules
COPY --from=build /app/server/dist ./dist
COPY --from=build /app/server/migrations ./migrations
USER node
EXPOSE 8080
CMD ["node", "dist/index.js"]
