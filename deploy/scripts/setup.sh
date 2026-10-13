#!/bin/bash
set -e

echo "=== Sankara Fellowship Exam — Server Setup ==="

DEPLOY_DIR="/opt/sankara-exam"

# 1. Install dependencies for API server
echo "[1/4] Installing API server dependencies..."
cd "$DEPLOY_DIR/api-server"
npm install --omit=dev

# 2. Load env
if [ ! -f "$DEPLOY_DIR/.env" ]; then
  echo "ERROR: .env file not found. Copy .env.example to .env and fill in values."
  exit 1
fi
export $(grep -v '^#' "$DEPLOY_DIR/.env" | xargs)

# 3. Run DB migrations
echo "[2/4] Running database migrations..."
cd "$DEPLOY_DIR/api-server"
node -e "
const { drizzle } = require('drizzle-orm/node-postgres');
const { migrate } = require('drizzle-orm/node-postgres/migrator');
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);
migrate(db, { migrationsFolder: './drizzle' }).then(() => { console.log('Migrations done'); pool.end(); });
" 2>/dev/null || node dist/index.mjs --migrate-only 2>/dev/null || echo "Run db:push manually if needed."

# 4. Start with PM2
echo "[3/4] Starting API server with PM2..."
pm2 delete fellowship-api 2>/dev/null || true
pm2 start "$DEPLOY_DIR/api-server/dist/index.mjs" \
  --name fellowship-api \
  --env production \
  --env-file "$DEPLOY_DIR/.env"
pm2 save

# 5. Nginx
echo "[4/4] Configuring Nginx..."
cp "$DEPLOY_DIR/nginx/exam.sankaraeye.com.conf" /etc/nginx/sites-available/
ln -sf /etc/nginx/sites-available/exam.sankaraeye.com.conf /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

echo ""
echo "=== Setup Complete ==="
echo "API: http://localhost:8080/api/health"
echo "Next step: sudo certbot --nginx -d exam.sankaraeye.com"
