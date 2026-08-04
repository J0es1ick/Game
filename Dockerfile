FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json tsconfig*.json ./
RUN npm ci

COPY src ./src
RUN npm run build:console

FROM node:20-alpine

WORKDIR /app
COPY --from=builder /app/dist-console ./dist-console

ENV NODE_ENV=production
CMD ["node", "dist-console/index.js"]
