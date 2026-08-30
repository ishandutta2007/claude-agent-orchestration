#!/bin/bash
# Clean up RuVector PostgreSQL data

set -e

HOST="${PGHOST:-localhost}"
PORT="${PGPORT:-5432}"
DATABASE="${PGDATABASE:-claude_flow}"
USER="${PGUSER:-claude}"
PASSWORD="${PGPASSWORD:-claude-flow-test}"

echo "🧹 Cleaning up RuVector PostgreSQL"
echo "=========================================="
echo ""
echo "⚠️  WARNING: This will delete ALL data in the claude_flow schema!"
echo ""
read -p "Are you sure? (y/N) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 0
fi

echo ""
echo "Dropping schema..."
PGPASSWORD=$PASSWORD psql -h $HOST -p $PORT -U $USER -d $DATABASE -c \
    "DROP SCHEMA IF EXISTS claude_flow CASCADE;"

echo "Recreating schema..."
PGPASSWORD=$PASSWORD psql -h $HOST -p $PORT -U $USER -d $DATABASE -c \
    "CREATE SCHEMA claude_flow; GRANT ALL ON SCHEMA claude_flow TO $USER;"

echo ""
echo "✅ Cleanup complete!"
echo ""
echo "To reinitialize, run:"
echo "  docker-compose down -v && docker-compose up -d"
echo ""
echo "Or run the init script manually:"
echo "  ./scripts/run-migrations.sh"
