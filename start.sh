#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if ! command -v docker >/dev/null 2>&1; then
  echo "Khong tim thay Docker CLI."
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "Khong tim thay Node.js/npm."
  exit 1
fi
if [[ ! -f .env.infrastructure ]]; then
  echo "Thieu .env.infrastructure. Hay copy .env.infrastructure.example va dien secret."
  exit 1
fi
if [[ ! -f apps/api/.env.database ]]; then
  echo "Thieu apps/api/.env.database. Dien DIRECT_DATABASE_URL bang role migrator."
  exit 1
fi
if [[ ! -f apps/api/.env ]]; then
  echo "Thieu apps/api/.env. Hay copy apps/api/.env.example va dien DATABASE_URL/JWT_SECRET."
  exit 1
fi

mkdir -p .data/logs
echo ">>> Khoi dong PostgreSQL..."
docker compose --env-file .env.infrastructure -f compose.database.yaml up -d --wait

echo ">>> Generate Prisma, migrate va seed..."
npm run db:generate -w api
npm run db:migrate -w api
npm run db:seed -w api

echo ">>> Khoi dong API va Web..."
npm run start:dev -w api > .data/logs/api.out.log 2> .data/logs/api.err.log &
API_PID=$!
npm run dev -w @diploma-chain/web > .data/logs/web.out.log 2> .data/logs/web.err.log &
WEB_PID=$!

cleanup() {
  kill "$API_PID" "$WEB_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "=========================================================="
echo "PostgreSQL, API va Web da duoc khoi dong."
echo "Frontend : http://localhost:3000"
echo "API      : http://localhost:3001"
echo "Swagger  : http://localhost:3001/docs"
echo "Fabric   : khong tu dong deploy; chi bat khi da review cutover."
echo "Nhan Ctrl+C de dung API/Web."
wait
