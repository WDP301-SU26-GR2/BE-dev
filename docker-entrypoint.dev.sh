#!/bin/bash
set -e

# ── 1. Start MongoDB ──────────────────────────────────────────────────────────
echo ">>> [1/5] Starting MongoDB (replica set rs0)..."
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

# ── 2. Install deps ───────────────────────────────────────────────────────────
echo ">>> [2/5] Installing dependencies..."
pnpm install --store-dir /root/.local/share/pnpm/store

# ── 3. Prisma generate ────────────────────────────────────────────────────────
echo ">>> [3/5] Generating Prisma Client..."
pnpm prisma generate

# ── 4. Prisma db push (create/update indexes) ─────────────────────────────────
echo ">>> [4/5] Pushing Prisma schema to MongoDB..."
pnpm prisma db push

# ── 5. Start NestJS watch mode ────────────────────────────────────────────────
echo ">>> [5/5] Starting NestJS (watch mode) on port ${PORT:-3000}..."
exec pnpm start:dev
