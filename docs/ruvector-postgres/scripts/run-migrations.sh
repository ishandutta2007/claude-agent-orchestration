#!/bin/bash
# Run RuVector PostgreSQL migrations

set -e

HOST="${PGHOST:-localhost}"
PORT="${PGPORT:-5432}"
DATABASE="${PGDATABASE:-claude_flow}"
USER="${PGUSER:-claude}"
PASSWORD="${PGPASSWORD:-claude-flow-test}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
MIGRATIONS_DIR="$PROJECT_ROOT/v3/@claude-flow/plugins/src/integrations/ruvector/migrations"

echo "🚀 Running RuVector PostgreSQL Migrations"
echo "=========================================="
echo ""
echo "Host: $HOST:$PORT"
echo "Database: $DATABASE"
echo "User: $USER"
echo "Migrations: $MIGRATIONS_DIR"
echo ""

# Check if migrations directory exists
if [ ! -d "$MIGRATIONS_DIR" ]; then
    echo "❌ Migrations directory not found: $MIGRATIONS_DIR"
    echo ""
    echo "Trying to use CLI instead..."
    npx claude-flow@alpha ruvector migrate \
        --host $HOST \
        --port $PORT \
        --database $DATABASE \
        --user $USER \
        --up
    exit $?
fi

# Run each migration in order
for migration in $(ls -1 "$MIGRATIONS_DIR"/*.sql 2>/dev/null | sort); do
    filename=$(basename "$migration")
    echo "📄 Running: $filename"

    PGPASSWORD=$PASSWORD psql -h $HOST -p $PORT -U $USER -d $DATABASE -f "$migration" 2>&1 | \
        grep -v "^$" | while read line; do
            echo "   $line"
        done

    if [ ${PIPESTATUS[0]} -eq 0 ]; then
        echo "   ✅ Complete"
    else
        echo "   ❌ Failed"
        exit 1
    fi
    echo ""
done

echo "=========================================="
echo "✅ All migrations complete!"
