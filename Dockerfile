# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci

COPY . .

RUN npm run build

# Stage 2: Serve static build with nginx
FROM nginx:1.27-alpine

COPY --from=builder /usr/src/app/dist /usr/share/nginx/html

# SPA fallback so client-side routes (react-router-dom) don't 404 on refresh
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
