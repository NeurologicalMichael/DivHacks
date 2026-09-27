#!/usr/bin/env bash
# Build a static site GitHub Pages can host. Pages cannot run the Next.js server or Postgres.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

mkdir -p public
cp data/snapshot.json public/snapshot.json

api_tmp="$(mktemp -d)"
mv src/app/api "$api_tmp/api"
cleanup() {
  rm -rf src/app/api
  mv "$api_tmp/api" src/app/api
  rm -rf "$api_tmp"
  rm -f public/snapshot.json
}
trap cleanup EXIT

export GITHUB_PAGES=true
export NEXT_PUBLIC_STATIC=1
npm run build
