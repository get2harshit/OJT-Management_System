# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci

COPY src ./src
RUN mkdir -p public
COPY public/ ./public/

RUN npm run build

# Stage 2: Serve static build with nginx
FROM nginx:1.27-alpine

COPY --from=builder /usr/src/app/dist /usr/share/nginx/html

COPY --from=builder /usr/src/app/dist ./dist
COPY server.js ./dist/server.js

EXPOSE 8080

CMD ["node", "dist/server.js"]

