#!/bin/bash
set -e

# ── 1. Start MongoDB ──────────────────────────────────────────────────────────
echo ">>> [1/6] Starting MongoDB (replica set rs0)..."
mongod --replSet rs0 --bind_ip_all --dbpath /data/db \
       --logpath /var/log/mongodb/mongod.log --fork

# Wait until mongod is ready to accept connections
until mongosh --quiet --eval "db.adminCommand('ping').ok" 2>/dev/null | grep -q 1; do
  echo "    Waiting for MongoDB..."
  sleep 1
done

# Initialize replica set on first run; subsequent runs are no-ops
mongosh --quiet --eval "
  try { rs.status(); }
  catch(e) { rs.initiate({_id:'rs0', members:[{_id:0, host:'localhost:27017'}]}); }
" > /dev/null

# Wait until this node is PRIMARY
until mongosh --quiet --eval "rs.isMaster().ismaster" 2>/dev/null | grep -q true; do
  echo "    Waiting for PRIMARY..."
  sleep 1
done

echo "    MongoDB ready."

# ── 2. Start Redis ──────────────────────────────────────────────────────────────
echo ">>> [2/6] Starting Redis server..."
redis-server --daemonize yes --dir /var/lib/redis --appendonly yes

# ── 3. Install deps ───────────────────────────────────────────────────────────
echo ">>> [3/6] Installing dependencies..."
pnpm install --store-dir /root/.local/share/pnpm/store

# ── 4. Prisma generate ────────────────────────────────────────────────────────
echo ">>> [4/6] Generating Prisma Client..."
pnpm prisma generate

# ── 5. Prisma db push (create/update indexes) ─────────────────────────────────
echo ">>> [5/6] Pushing Prisma schema to MongoDB..."
pnpm prisma db push

# ── 6. Start NestJS watch mode ────────────────────────────────────────────────
echo ">>> [6/6] Starting NestJS (watch mode) on port ${PORT:-3000}..."
exec pnpm start:dev
