#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

cleanup() {
  trap - INT TERM
  docker compose down
}

trap cleanup INT TERM

docker compose down
docker compose up -d
docker compose logs -f
