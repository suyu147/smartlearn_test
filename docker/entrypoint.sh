#!/bin/sh
set -e

echo "=== SmartLearn Docker Entrypoint ==="

# Run Prisma migrations (idempotent: creates tables if missing, no-ops if up-to-date)
echo "Running database migrations..."
if ! npx prisma migrate deploy 2>&1; then
  echo "ERROR: Database migration failed."
  echo "Please check the DATABASE_URL and migration status before restarting."
  echo "To manually fix: docker compose exec app npx prisma migrate resolve --applied <migration_name>"
  exit 1
fi

echo "Database ready."

# Start the application
# Note: /app/data directory is created in Dockerfile with correct ownership
echo "Starting SmartLearn server..."
exec node server.js
