# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
COPY tsconfig*.json ./
COPY vite.config.ts ./
COPY tailwind.config.js ./
COPY postcss.config.js ./
COPY index.html ./

RUN npm ci

COPY src ./src
COPY public ./public

RUN npm run build

# Stage 2: Production Run
FROM node:20-alpine

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm ci --omit=dev

COPY public ./public
COPY --from=builder /usr/src/app/dist ./dist
COPY server.js ./dist/server.js

EXPOSE 8080
ENV NODE_ENV=production

CMD ["node", "dist/server.js"]
