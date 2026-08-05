# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci

COPY . .

# Which environment this image is for. Vite resolves import.meta.env while
# bundling and writes the result into the JS, so the backend and Supabase
# project it talks to are fixed here, not at run time — setting them as Cloud
# Run variables does nothing, because by then the bundle exists and nginx only
# hands out files.
#
# The addresses themselves live in .env.staging / .env.production, in git, where
# they can be read and diffed. Only the choice between them comes from outside.
ARG BUILD_MODE

# No default, and the file has to exist. A missing or misspelled mode would
# otherwise fall through to whatever `vite build` loads by default and produce a
# bundle quietly pointing at the wrong environment — which is exactly how the
# production image ended up carrying the staging API address.
RUN set -e; \
    if [ -z "$BUILD_MODE" ]; then \
      echo "ERROR: missing --build-arg BUILD_MODE (e.g. staging, production)" >&2; \
      exit 1; \
    fi; \
    if [ ! -f ".env.$BUILD_MODE" ]; then \
      echo "ERROR: BUILD_MODE=$BUILD_MODE but .env.$BUILD_MODE does not exist" >&2; \
      echo "       available:" >&2; \
      ls -1 .env.* 2>/dev/null | sed 's/^/         /' >&2; \
      exit 1; \
    fi

RUN npm run build -- --mode "$BUILD_MODE"

# Stage 2: Serve static build with nginx
FROM nginx:1.27-alpine

COPY --from=builder /usr/src/app/dist /usr/share/nginx/html

# SPA fallback so client-side routes (react-router-dom) don't 404 on refresh
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
