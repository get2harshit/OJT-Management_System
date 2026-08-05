# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci

COPY . .

# Vite resolves import.meta.env while bundling and writes the result into the
# JS, so which backend and which Supabase project this image talks to is fixed
# here, not at run time. Setting them as Cloud Run variables does nothing: by
# then the bundle exists and nginx only hands out files.
#
# Build args rather than an env file because .dockerignore excludes .env* — and
# it should, the local one holds a service-role key — so no env file can reach
# this stage.
ARG VITE_API_BASE_URL
ARG VITE_SUPABASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL

# Refuse to build rather than let the source fall back.
#
# The fallbacks point at the dev/staging project. That is what you want for
# `npm run dev` and wrong for anything deployed, and because nothing here ever
# demanded a value, the production image was built with them: the bundle served
# from the production URL carries the staging API address, so production has
# been reading and writing the staging database.
#
# An image that cannot name its environment must not exist. Failing here is
# loud and takes two substitutions to fix; the alternative is silent and took
# a diff of two bundles to notice.
RUN set -e; \
    if [ -z "$VITE_API_BASE_URL" ]; then \
      echo "ERROR: missing --build-arg VITE_API_BASE_URL (which backend this bundle calls)" >&2; \
      exit 1; \
    fi; \
    if [ -z "$VITE_SUPABASE_URL" ]; then \
      echo "ERROR: missing --build-arg VITE_SUPABASE_URL (which Supabase project signs users in)" >&2; \
      exit 1; \
    fi

RUN npm run build

# Stage 2: Serve static build with nginx
FROM nginx:1.27-alpine

COPY --from=builder /usr/src/app/dist /usr/share/nginx/html

# SPA fallback so client-side routes (react-router-dom) don't 404 on refresh
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
