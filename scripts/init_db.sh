#!/bin/bash
set -e

SQLITE_DB=/data/db/app.db

if [ -f "$SQLITE_DB" ]; then
    echo "Database already exists, skipping initialization"
    exit 0
fi

echo "Initializing database..."
sqlite3 "$SQLITE_DB" < /app/backend/schema.sql
chmod 666 "$SQLITE_DB"
echo "Database initialized successfully"