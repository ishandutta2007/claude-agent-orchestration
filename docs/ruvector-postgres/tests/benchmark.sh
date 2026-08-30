#!/bin/bash
# RuVector PostgreSQL Performance Benchmarks
#
# Measures:
# - Search latency (HNSW)
# - Insert throughput
# - Local embedding generation
# - Attention computation

set -e

HOST="${PGHOST:-localhost}"
PORT="${PGPORT:-5432}"
DATABASE="${PGDATABASE:-claude_flow}"
USER="${PGUSER:-claude}"
PASSWORD="${PGPASSWORD:-claude-flow-test}"

ITERATIONS="${1:-100}"

echo "============================================"
echo "RuVector PostgreSQL Benchmarks"
echo "============================================"
echo ""
echo "Host: $HOST:$PORT"
echo "Database: $DATABASE"
echo "Iterations: $ITERATIONS"
echo ""

# Helper to run SQL with timing
run_timed() {
    local name="$1"
    local sql="$2"
    local iterations="${3:-$ITERATIONS}"

    echo "Benchmarking: $name"

    local start=$(date +%s%N)

    for ((i=1; i<=iterations; i++)); do
        PGPASSWORD=$PASSWORD psql -h $HOST -p $PORT -U $USER -d $DATABASE -t -c "$sql" > /dev/null 2>&1
    done

    local end=$(date +%s%N)
    local total_ms=$(( (end - start) / 1000000 ))
    local avg_ms=$(echo "scale=3; $total_ms / $iterations" | bc)

    echo "  Total: ${total_ms}ms for $iterations iterations"
    echo "  Average: ${avg_ms}ms per operation"
    echo ""
}

# ============================================
# 1. SEARCH LATENCY
# ============================================

echo "============================================"
echo "1. HNSW Search Latency"
echo "============================================"

run_timed "Simple similarity search" \
    "SELECT id FROM claude_flow.embeddings WHERE embedding IS NOT NULL ORDER BY embedding <-> ruvector.fastembed('test query', 'all-MiniLM-L6-v2') LIMIT 10"

run_timed "Search with threshold" \
    "SELECT id, content FROM claude_flow.embeddings WHERE embedding IS NOT NULL AND ruvector.cosine_similarity(embedding, ruvector.fastembed('test', 'all-MiniLM-L6-v2')) > 0.5 ORDER BY embedding <-> ruvector.fastembed('test', 'all-MiniLM-L6-v2') LIMIT 10"

# ============================================
# 2. EMBEDDING GENERATION
# ============================================

echo "============================================"
echo "2. Local Embedding Generation"
echo "============================================"

run_timed "Single embedding (384-dim)" \
    "SELECT ruvector.fastembed('This is a test sentence for embedding generation', 'all-MiniLM-L6-v2')" \
    50

# ============================================
# 3. INSERT THROUGHPUT
# ============================================

echo "============================================"
echo "3. Insert Throughput"
echo "============================================"

# Clean up test data first
PGPASSWORD=$PASSWORD psql -h $HOST -p $PORT -U $USER -d $DATABASE -c \
    "DELETE FROM claude_flow.embeddings WHERE metadata->>'benchmark' = 'true'" > /dev/null 2>&1

echo "Inserting $ITERATIONS embeddings..."
local start=$(date +%s%N)

for ((i=1; i<=ITERATIONS; i++)); do
    PGPASSWORD=$PASSWORD psql -h $HOST -p $PORT -U $USER -d $DATABASE -t -c \
        "INSERT INTO claude_flow.embeddings (content, embedding, metadata) VALUES ('Benchmark content $i', ruvector.fastembed('Benchmark content $i', 'all-MiniLM-L6-v2'), '{\"benchmark\": true}'::jsonb)" > /dev/null 2>&1
done

local end=$(date +%s%N)
local total_ms=$(( (end - start) / 1000000 ))
local rate=$(echo "scale=1; $ITERATIONS * 1000 / $total_ms" | bc)

echo "  Total: ${total_ms}ms for $ITERATIONS inserts"
echo "  Rate: ${rate} inserts/second"
echo ""

# Clean up
PGPASSWORD=$PASSWORD psql -h $HOST -p $PORT -U $USER -d $DATABASE -c \
    "DELETE FROM claude_flow.embeddings WHERE metadata->>'benchmark' = 'true'" > /dev/null 2>&1

# ============================================
# 4. DISTANCE CALCULATIONS
# ============================================

echo "============================================"
echo "4. Distance Calculations"
echo "============================================"

run_timed "Cosine similarity" \
    "SELECT ruvector.cosine_similarity(ruvector.fastembed('hello', 'all-MiniLM-L6-v2'), ruvector.fastembed('world', 'all-MiniLM-L6-v2'))" \
    50

run_timed "Euclidean distance" \
    "SELECT ruvector.euclidean_distance(ruvector.fastembed('hello', 'all-MiniLM-L6-v2'), ruvector.fastembed('world', 'all-MiniLM-L6-v2'))" \
    50

run_timed "Dot product" \
    "SELECT ruvector.dot_product(ruvector.fastembed('hello', 'all-MiniLM-L6-v2'), ruvector.fastembed('world', 'all-MiniLM-L6-v2'))" \
    50

# ============================================
# 5. ATTENTION MECHANISMS
# ============================================

echo "============================================"
echo "5. Attention Mechanisms"
echo "============================================"

run_timed "Softmax attention" \
    "SELECT ruvector.softmax_attention(ruvector.fastembed('query', 'all-MiniLM-L6-v2'), ruvector.fastembed('key', 'all-MiniLM-L6-v2'), 1.0)" \
    50

run_timed "Multi-head attention (8 heads)" \
    "SELECT ruvector.multihead_attention_aggregate(ruvector.fastembed('query', 'all-MiniLM-L6-v2'), ruvector.fastembed('key', 'all-MiniLM-L6-v2'), 8)" \
    50

# ============================================
# 6. HYPERBOLIC OPERATIONS
# ============================================

echo "============================================"
echo "6. Hyperbolic Operations"
echo "============================================"

run_timed "Poincaré mapping" \
    "SELECT ruvector.exp_map_poincare(ruvector.fastembed('test', 'all-MiniLM-L6-v2'), -1.0)" \
    50

run_timed "Hyperbolic distance" \
    "SELECT ruvector.hyperbolic_distance(ruvector.exp_map_poincare(ruvector.fastembed('a', 'all-MiniLM-L6-v2'), -1.0), ruvector.exp_map_poincare(ruvector.fastembed('b', 'all-MiniLM-L6-v2'), -1.0), 'poincare', -1.0)" \
    50

# ============================================
# SUMMARY
# ============================================

echo "============================================"
echo "Benchmark Complete"
echo "============================================"
echo ""
echo "Expected performance:"
echo "  - HNSW Search: ~61µs (k=10, 384-dim)"
echo "  - Throughput: 16,400 QPS"
echo "  - Insert Rate: 10,000+/sec with batching"
echo ""
echo "Note: Actual performance depends on:"
echo "  - Data volume"
echo "  - Index build status"
echo "  - Hardware (SIMD support)"
echo "  - Connection overhead"
echo ""
