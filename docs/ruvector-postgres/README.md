# RuVector PostgreSQL Testing Environment

A Docker-based testing environment for the **RuVector PostgreSQL extension** from [ruvnet/ruvector-postgres](https://hub.docker.com/r/ruvnet/ruvector-postgres).

> **Note**: This uses the official RuVector PostgreSQL extension, not pgvector. RuVector provides 77+ SQL functions with advanced AI capabilities.

## RuVector Features

| Feature | Description |
|---------|-------------|
| **77+ SQL Functions** | Comprehensive vector operations in SQL |
| **HNSW/IVFFlat Indexing** | ~61µs search latency, 16,400 QPS |
| **Hyperbolic Embeddings** | Poincaré ball model for hierarchical data |
| **Graph Operations** | GNN message passing, Cypher queries |
| **SPARQL Support** | RDF triple store functions |
| **Agent Routing** | Pattern-based task routing |
| **Self-Learning** | Continuous optimization |
| **SIMD Acceleration** | AVX-512/AVX2/NEON (~2x faster) |

## Quick Start

### Option 1: Use CLI Setup Command (Recommended)

```bash
# Generate Docker files and SQL in any directory
npx claude-flow ruvector setup --output ./my-ruvector

# Start the container
cd my-ruvector
docker-compose up -d
```

### Option 2: Use Existing Files

```bash
# From this directory
docker-compose up -d

# Or from the project root
docker-compose -f docs/ruvector-postgres/docker-compose.yml up -d
```

### 2. Verify the container is running

```bash
docker-compose ps
```

You should see:
```
NAME                STATUS              PORTS
ruvector-postgres   running (healthy)   0.0.0.0:5432->5432/tcp
```

### 3. Test the connection

```bash
# Check RuVector version
docker exec ruvector-postgres psql -U claude -d claude_flow -c "SELECT ruvector_version();"

# Expected output:
# 2.0.0
```

## Connection Details

| Setting | Value |
|---------|-------|
| Host | `localhost` |
| Port | `5432` |
| Database | `claude_flow` |
| Username | `claude` |
| Password | `claude-flow-test` |
| Schema | `claude_flow` |

## RuVector SQL Syntax

### Important: Extension Installation

The RuVector extension requires an explicit version when installing:

```sql
-- CORRECT: Use explicit version
CREATE EXTENSION IF NOT EXISTS ruvector VERSION '0.1.0';

-- INCORRECT: Will fail without version
-- CREATE EXTENSION IF NOT EXISTS ruvector;
```

### Vector Type

RuVector uses its own `ruvector` type, not `vector`:

```sql
-- CORRECT: RuVector type
CREATE TABLE embeddings (
    id UUID PRIMARY KEY,
    embedding ruvector(384)  -- 384 dimensions
);

-- INCORRECT: pgvector syntax
-- embedding vector(384)
-- embedding ruvector.vector(384)
```

### Distance Operators

| Operator | Description | Index Support |
|----------|-------------|---------------|
| `<=>` | Cosine distance | HNSW |
| `<->` | L2 (Euclidean) distance | HNSW |
| `<#>` | Negative inner product | HNSW |

```sql
-- Cosine similarity search
SELECT * FROM embeddings
ORDER BY embedding <=> '[0.1, 0.2, ...]'::ruvector(384)
LIMIT 10;

-- Convert distance to similarity
SELECT (1 - (a.embedding <=> b.embedding)) AS similarity
FROM embeddings a, embeddings b;
```

### HNSW Index

```sql
-- Create HNSW index for cosine distance
CREATE INDEX idx_embeddings_hnsw
ON embeddings
USING hnsw (embedding ruvector_cosine_ops)
WITH (m = 16, ef_construction = 100);

-- For L2 distance
-- USING hnsw (embedding ruvector_l2_ops)
```

### Hyperbolic Embeddings

Hyperbolic functions use `real[]` arrays, not ruvector type:

```sql
-- Poincaré distance
SELECT ruvector_poincare_distance(
    ARRAY[0.1, 0.2, 0.0]::real[],  -- point A
    ARRAY[0.3, 0.1, 0.0]::real[],  -- point B
    -1.0                            -- curvature
) AS distance;

-- Exponential map (Euclidean to Poincaré)
SELECT ruvector_exp_map(
    ARRAY[0.0, 0.0, 0.0]::real[],  -- origin
    ARRAY[0.1, 0.2, 0.3]::real[],  -- tangent vector
    -1.0                            -- curvature
);

-- Möbius addition
SELECT ruvector_mobius_add(
    ARRAY[0.1, 0.0]::real[],
    ARRAY[0.0, 0.1]::real[],
    -1.0
);
```

### Array-Based Distance Functions

```sql
-- Cosine similarity for arrays
SELECT cosine_similarity_arr(
    ARRAY[1.0, 0.0, 0.0]::real[],
    ARRAY[0.7, 0.7, 0.0]::real[]
);

-- L2 distance for arrays
SELECT l2_distance_arr(
    ARRAY[1.0, 0.0, 0.0]::real[],
    ARRAY[0.0, 1.0, 0.0]::real[]
);
```

## Available Tables (Claude-Flow Schema)

The init script creates these tables:

| Table | Description |
|-------|-------------|
| `memory_entries` | Main memory storage (key-value with embeddings) |
| `embeddings` | Content with vector embeddings |
| `patterns` | Learned patterns (ReasoningBank) |
| `agents` | Multi-agent memory coordination |
| `trajectories` | SONA reinforcement learning |
| `hyperbolic_embeddings` | Hierarchical data embeddings |
| `graph_nodes` | GNN node data |
| `graph_edges` | GNN edge relationships |

## Custom Functions

The init script creates these helper functions:

```sql
-- Semantic similarity search
SELECT * FROM claude_flow.search_similar(
    '[...]'::ruvector(384),  -- query embedding
    10,                       -- limit
    0.5                       -- min similarity
);

-- Pattern search with type filtering
SELECT * FROM claude_flow.search_patterns(
    '[...]'::ruvector(384),
    'security',               -- pattern type
    10,                       -- limit
    0.5                       -- min confidence
);

-- Find agents by expertise
SELECT * FROM claude_flow.find_agents(
    '[...]'::ruvector(384),
    'coder',                  -- agent type
    5                         -- limit
);

-- Hyperbolic search
SELECT * FROM claude_flow.hyperbolic_search(
    '[...]'::ruvector(384),
    10,                       -- limit
    -1.0                      -- curvature
);

-- Cosine similarity helper
SELECT claude_flow.cosine_similarity(a, b);

-- L2 distance helper
SELECT claude_flow.l2_distance(a, b);

-- Get RuVector info
SELECT * FROM claude_flow.ruvector_info();
```

## Common Operations

### Insert embedding

```bash
docker exec ruvector-postgres psql -U claude -d claude_flow -c "
INSERT INTO claude_flow.embeddings (content, embedding, metadata)
VALUES (
    'Example content',
    '[0.1,0.2,...]'::ruvector(384),
    '{\"category\": \"test\"}'::jsonb
);
"
```

### Similarity search

```bash
docker exec ruvector-postgres psql -U claude -d claude_flow -c "
SELECT id, content, (1 - (embedding <=> '[0.1,0.2,...]'::ruvector(384))) AS similarity
FROM claude_flow.embeddings
WHERE embedding IS NOT NULL
ORDER BY embedding <=> '[0.1,0.2,...]'::ruvector(384)
LIMIT 5;
"
```

### Check HNSW indices

```bash
docker exec ruvector-postgres psql -U claude -d claude_flow -c "
SELECT indexname FROM pg_indexes
WHERE schemaname = 'claude_flow' AND indexdef LIKE '%hnsw%';
"
```

### Check RuVector SIMD status

```bash
docker exec ruvector-postgres psql -U claude -d claude_flow -c "
SELECT ruvector_version(), ruvector_simd_info();
"
```

## Migration from sql.js/JSON

To migrate from Claude-Flow's sql.js/JSON storage to RuVector PostgreSQL:

### Option 1: Use CLI Import Tool (Recommended)

```bash
# Export current memory to JSON
npx claude-flow memory list --format json > memory-export.json

# Import directly to PostgreSQL
npx claude-flow ruvector import --input memory-export.json

# Or generate SQL file first (dry-run)
npx claude-flow ruvector import --input memory-export.json --output import.sql
docker exec -i ruvector-postgres psql -U claude -d claude_flow < import.sql
```

The import tool:
- Supports JSON arrays or objects
- Handles namespaces and metadata
- Uses upsert (ON CONFLICT) for safe re-imports
- Shows import statistics

### Option 2: Manual Migration

```bash
# Export memory entries to JSON
npx claude-flow memory list --format json > memory-export.json

# Create SQL from JSON using jq
cat memory-export.json | jq -r '.[] | "INSERT INTO claude_flow.memory_entries (key, value, namespace, metadata) VALUES (\047\(.key)\047, \047\(.value | tostring)\047, \047\(.namespace // "default")\047, \047\(.metadata // {} | tojson)\047::jsonb);"' > import.sql

# Import to PostgreSQL
docker exec -i ruvector-postgres psql -U claude -d claude_flow < import.sql
```

### Generate Embeddings

Embeddings can be generated via Claude-Flow MCP and updated:

```sql
-- After generating embedding via MCP
UPDATE claude_flow.memory_entries
SET embedding = '[...]'::ruvector(384)
WHERE key = 'my-key' AND namespace = 'my-namespace';
```

## pgAdmin (Optional)

For visual database management:

```bash
# Start with pgAdmin
docker-compose --profile gui up -d
```

Access at: http://localhost:5050
- Email: `admin@claude-flow.local`
- Password: `admin`

## Troubleshooting

### Extension creation fails

If you see: `extension 'ruvector' has no installation script nor update path for version "2.0.0"`

**Solution**: Use explicit version:
```sql
CREATE EXTENSION IF NOT EXISTS ruvector VERSION '0.1.0';
```

### Container won't start

```bash
# Check logs
docker-compose logs postgres

# Check if port 5432 is in use
lsof -i :5432

# Reset completely
docker-compose down -v
docker-compose up -d
```

### HNSW warnings

Warnings like `HNSW: Could not extract query vector` during COUNT queries are benign and can be ignored.

### Type mismatch errors

Ensure you're using:
- `ruvector(384)` for vector columns
- `real[]` for hyperbolic function arguments
- `::ruvector(384)` for casting string vectors

## CLI Commands

Claude-Flow provides CLI commands for RuVector PostgreSQL management:

### `ruvector setup`

Generate Docker files and SQL for easy setup:

```bash
# Output to default directory (./ruvector-postgres)
npx claude-flow ruvector setup

# Output to custom directory
npx claude-flow ruvector setup --output /path/to/dir

# Print files to stdout (for inspection)
npx claude-flow ruvector setup --print

# Force overwrite existing files
npx claude-flow ruvector setup --force
```

**Generated files:**
```
ruvector-postgres/
├── docker-compose.yml    # Docker services configuration
├── README.md             # Quick start guide
└── scripts/
    └── init-db.sql       # Database initialization
```

### `ruvector import`

Import data from sql.js/JSON memory to PostgreSQL:

```bash
# Import from JSON file (direct execution)
npx claude-flow ruvector import --input memory-export.json

# Generate SQL file (dry-run)
npx claude-flow ruvector import --input memory-export.json --output import.sql

# Use custom Docker container
npx claude-flow ruvector import --input data.json --container my-postgres

# Verbose output
npx claude-flow ruvector import --input data.json --verbose
```

**Supported JSON formats:**
- Array of entries: `[{"key": "...", "value": "...", "namespace": "..."}]`
- Object with entries: `{"entries": [...]}`
- Key-value object: `{"key1": "value1", "key2": "value2"}`

### Other Commands

```bash
# Check connection and schema status
npx claude-flow ruvector status --verbose

# Run database migrations
npx claude-flow ruvector migrate --up

# Run performance benchmarks
npx claude-flow ruvector benchmark --vectors 10000

# Analyze and optimize
npx claude-flow ruvector optimize --analyze

# Backup data
npx claude-flow ruvector backup --output backup.sql
```

## Performance Benchmarks

| Metric | Value |
|--------|-------|
| HNSW Search Latency | ~61µs (k=10, 384-dim) |
| Throughput | 16,400 QPS |
| SIMD | AVX2 (8 floats/op) |

## Directory Structure

```
docs/ruvector-postgres/
├── README.md                 # This file
├── docker-compose.yml        # Docker services
├── scripts/
│   ├── init-db.sql          # Database initialization
│   └── test-connection.sh   # Connection test script
├── examples/
│   └── basic-queries.sql    # Example queries
└── tests/
    └── benchmark.sh         # Performance benchmarks
```

## Learn More

- [RuVector PostgreSQL Docker Hub](https://hub.docker.com/r/ruvnet/ruvector-postgres)
- [Claude-Flow Documentation](https://github.com/ruvnet/claude-flow)
