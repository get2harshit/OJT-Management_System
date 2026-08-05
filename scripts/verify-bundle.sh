#!/bin/sh
# Proves that the bundle just built is pointed at the environment it claims to
# be, and must run immediately after `vite build` in every image.
#
# Why this exists
# ---------------
# Vite resolves import.meta.env while bundling, so the backend URL and the
# Supabase project are frozen into the JS at build time and nothing at runtime
# can correct them. For weeks production served a bundle that called the staging
# backend: the variable never reached the build, the source fell back to a
# staging default, and the result was an app that worked perfectly against the
# wrong database. There was no error to find, because nothing had failed.
#
# The fallbacks are gone now (see src/lib/env.ts), which turns a missing
# variable into a build failure. This script covers the other half: a variable
# that is present but wrong, or right in the file yet never baked in. It reads
# the values the mode is supposed to use and greps the emitted JS for each one.
#
# Usage: sh scripts/verify-bundle.sh <mode>      # staging | production
set -e

MODE="$1"
ENV_FILE=".env.$MODE"
DIST="dist"
KEYS="VITE_API_BASE_URL VITE_SUPABASE_URL"

if [ -z "$MODE" ]; then
  echo "ERROR: usage: sh scripts/verify-bundle.sh <mode>" >&2
  exit 1
fi
if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE not found" >&2
  exit 1
fi
if [ ! -d "$DIST" ]; then
  echo "ERROR: $DIST/ not found — run this after the build, not before" >&2
  exit 1
fi

# Last assignment wins, matching how Vite reads these files. Trailing CR is
# stripped so a file saved on Windows doesn't produce a value that can never
# be found in the bundle.
read_var() {
  grep "^$1=" "$2" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '\r' || true
}

echo "verifying $DIST against $ENV_FILE"

for KEY in $KEYS; do
  VALUE=$(read_var "$KEY" "$ENV_FILE")

  if [ -z "$VALUE" ]; then
    echo "ERROR: $KEY is missing or empty in $ENV_FILE" >&2
    exit 1
  fi

  if ! grep -rqF "$VALUE" "$DIST"; then
    echo "ERROR: $KEY was set to '$VALUE' but that value is nowhere in the built bundle." >&2
    echo "       The build did not pick up $ENV_FILE — check the --mode flag." >&2
    exit 1
  fi

  echo "  ok  $KEY = $VALUE"
done

# The failure this is really guarding against, stated directly: a production
# image must not contain a staging address anywhere. Checked by value rather
# than by key, so it still catches the case where a stale import or a copied
# constant reintroduces one somewhere this script does not know to look.
if [ "$MODE" = "production" ] && [ -f .env.staging ]; then
  for KEY in $KEYS; do
    STAGING_VALUE=$(read_var "$KEY" .env.staging)
    PROD_VALUE=$(read_var "$KEY" "$ENV_FILE")

    # Identical between environments means there is nothing to leak.
    if [ -n "$STAGING_VALUE" ] && [ "$STAGING_VALUE" != "$PROD_VALUE" ]; then
      if grep -rqF "$STAGING_VALUE" "$DIST"; then
        echo "ERROR: the staging value for $KEY ('$STAGING_VALUE') is present in a" >&2
        echo "       production bundle. Production would talk to staging." >&2
        exit 1
      fi
      echo "  ok  no staging $KEY in the production bundle"
    fi
  done
fi

echo "bundle verified for mode '$MODE'"
