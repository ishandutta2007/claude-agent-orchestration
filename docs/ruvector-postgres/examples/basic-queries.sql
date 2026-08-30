-- ============================================
-- RUVECTOR POSTGRESQL BASIC QUERIES
-- ============================================
--
-- Basic vector operations using RuVector PostgreSQL extension
-- from ruvnet/ruvector (77+ SQL functions)
--
-- Features demonstrated:
-- - Vector storage and retrieval
-- - HNSW indexed similarity search
-- - Local embedding generation (fastembed)
-- - Metadata filtering
-- - SIMD-accelerated distance calculations

-- Set search path
SET search_path TO claude_flow, ruvector, public;

-- ============================================
-- 1. INSERT EMBEDDINGS
-- ============================================

-- Insert with local embedding generation (no API calls)
INSERT INTO claude_flow.embeddings (content, embedding, metadata)
VALUES (
    'Introduction to machine learning algorithms',
    ruvector.fastembed('Introduction to machine learning algorithms', 'all-MiniLM-L6-v2'),
    '{"category": "tutorial", "language": "english", "level": "beginner"}'::jsonb
);

-- Insert multiple embeddings
INSERT INTO claude_flow.embeddings (content, embedding, metadata)
SELECT
    title,
    ruvector.fastembed(title, 'all-MiniLM-L6-v2'),
    jsonb_build_object('category', category, 'agent', agent)
FROM (VALUES
    ('Building REST APIs with Node.js', 'backend', 'coder'),
    ('Deep learning fundamentals', 'ai', 'researcher'),
    ('PostgreSQL performance optimization', 'database', 'perf-engineer'),
    ('Secure authentication patterns', 'security', 'security-architect'),
    ('Test-driven development practices', 'testing', 'tester')
) AS data(title, category, agent);


-- ============================================
-- 2. SIMILARITY SEARCH (HNSW Indexed)
-- ============================================

-- Basic similarity search (~61µs latency with HNSW)
SELECT
    id,
    content,
    ruvector.cosine_similarity(
        embedding,
        ruvector.fastembed('machine learning', 'all-MiniLM-L6-v2')
    ) AS similarity
FROM claude_flow.embeddings
WHERE embedding IS NOT NULL
ORDER BY embedding <-> ruvector.fastembed('machine learning', 'all-MiniLM-L6-v2')
LIMIT 5;

-- Search with minimum similarity threshold
SELECT
    id,
    content,
    ruvector.cosine_similarity(embedding, query_emb) AS similarity,
    metadata
FROM claude_flow.embeddings,
     LATERAL (SELECT ruvector.fastembed('API development', 'all-MiniLM-L6-v2') AS query_emb) q
WHERE embedding IS NOT NULL
  AND ruvector.cosine_similarity(embedding, query_emb) > 0.5
ORDER BY embedding <-> query_emb
LIMIT 10;


-- ============================================
-- 3. DISTANCE CALCULATIONS
-- ============================================

-- Cosine similarity (most common for text)
SELECT
    a.content AS content_a,
    b.content AS content_b,
    ruvector.cosine_similarity(a.embedding, b.embedding) AS cosine_sim
FROM claude_flow.embeddings a
CROSS JOIN claude_flow.embeddings b
WHERE a.id < b.id
  AND a.embedding IS NOT NULL
  AND b.embedding IS NOT NULL
LIMIT 10;

-- Euclidean distance
SELECT
    content,
    ruvector.euclidean_distance(
        embedding,
        ruvector.fastembed('database optimization', 'all-MiniLM-L6-v2')
    ) AS l2_distance
FROM claude_flow.embeddings
WHERE embedding IS NOT NULL
ORDER BY l2_distance
LIMIT 5;

-- Dot product (for normalized vectors)
SELECT
    content,
    ruvector.dot_product(embedding, query_emb) AS dot_product
FROM claude_flow.embeddings,
     LATERAL (SELECT ruvector.fastembed('security', 'all-MiniLM-L6-v2') AS query_emb) q
WHERE embedding IS NOT NULL
ORDER BY dot_product DESC
LIMIT 5;


-- ============================================
-- 4. METADATA FILTERING + VECTOR SEARCH
-- ============================================

-- Filter by category, then search
SELECT
    content,
    metadata->>'category' AS category,
    ruvector.cosine_similarity(embedding, query_emb) AS similarity
FROM claude_flow.embeddings,
     LATERAL (SELECT ruvector.fastembed('best practices', 'all-MiniLM-L6-v2') AS query_emb) q
WHERE embedding IS NOT NULL
  AND metadata->>'category' = 'testing'
ORDER BY embedding <-> query_emb
LIMIT 5;

-- Filter by multiple metadata fields
SELECT
    content,
    metadata,
    ruvector.cosine_similarity(embedding, query_emb) AS similarity
FROM claude_flow.embeddings,
     LATERAL (SELECT ruvector.fastembed('development', 'all-MiniLM-L6-v2') AS query_emb) q
WHERE embedding IS NOT NULL
  AND metadata @> '{"agent": "coder"}'::jsonb
ORDER BY embedding <-> query_emb
LIMIT 5;


-- ============================================
-- 5. PATTERN OPERATIONS
-- ============================================

-- Store a learned pattern
INSERT INTO claude_flow.patterns (name, description, embedding, pattern_type, confidence)
VALUES (
    'api-error-handling',
    'Standard error handling pattern for REST APIs',
    ruvector.fastembed('REST API error handling with proper status codes and error messages', 'all-MiniLM-L6-v2'),
    'code-pattern',
    0.85
);

-- Search patterns by type and similarity
SELECT
    name,
    description,
    confidence,
    ruvector.cosine_similarity(embedding, query_emb) AS match_score
FROM claude_flow.patterns,
     LATERAL (SELECT ruvector.fastembed('handling errors in APIs', 'all-MiniLM-L6-v2') AS query_emb) q
WHERE embedding IS NOT NULL
  AND pattern_type = 'code-pattern'
  AND confidence >= 0.7
ORDER BY embedding <-> query_emb
LIMIT 5;

-- Update pattern confidence based on success/failure
UPDATE claude_flow.patterns
SET
    confidence = LEAST(1.0, confidence + 0.05),
    success_count = success_count + 1
WHERE name = 'api-error-handling';


-- ============================================
-- 6. AGENT MEMORY OPERATIONS
-- ============================================

-- Register/update agent with memory embedding
INSERT INTO claude_flow.agents (agent_id, agent_type, state, memory_embedding)
VALUES (
    'coder-v3-001',
    'coder',
    '{"specializations": ["typescript", "node"], "tasks_completed": 0}'::jsonb,
    ruvector.fastembed('TypeScript Node.js backend development', 'all-MiniLM-L6-v2')
)
ON CONFLICT (agent_id) DO UPDATE SET
    state = EXCLUDED.state,
    memory_embedding = EXCLUDED.memory_embedding,
    last_active = NOW();

-- Find agents with similar expertise
SELECT
    agent_id,
    agent_type,
    state->>'specializations' AS specializations,
    ruvector.cosine_similarity(memory_embedding, query_emb) AS expertise_match
FROM claude_flow.agents,
     LATERAL (SELECT ruvector.fastembed('React frontend development', 'all-MiniLM-L6-v2') AS query_emb) q
WHERE memory_embedding IS NOT NULL
ORDER BY memory_embedding <-> query_emb
LIMIT 3;


-- ============================================
-- 7. BATCH EMBEDDING GENERATION
-- ============================================

-- Generate embeddings for multiple texts at once
SELECT
    text_content,
    ruvector.fastembed(text_content, 'all-MiniLM-L6-v2') AS embedding
FROM unnest(ARRAY[
    'First document about databases',
    'Second document about APIs',
    'Third document about testing'
]) AS text_content;

-- Update existing records with embeddings
UPDATE claude_flow.embeddings
SET embedding = ruvector.fastembed(content, 'all-MiniLM-L6-v2')
WHERE embedding IS NULL;


-- ============================================
-- 8. INDEX MANAGEMENT
-- ============================================

-- Check HNSW index status
SELECT
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'claude_flow'
  AND indexdef LIKE '%ruvector_hnsw%';

-- Check index usage statistics
SELECT
    schemaname,
    relname,
    indexrelname,
    idx_scan,
    idx_tup_read
FROM pg_stat_user_indexes
WHERE schemaname = 'claude_flow';

-- Trigger self-learning optimization
SELECT ruvector.learn_optimize('claude_flow.embeddings', 'embedding');


-- ============================================
-- 9. AGGREGATIONS
-- ============================================

-- Count by category with average similarity to a topic
SELECT
    metadata->>'category' AS category,
    COUNT(*) AS count,
    AVG(ruvector.cosine_similarity(embedding, query_emb)) AS avg_relevance
FROM claude_flow.embeddings,
     LATERAL (SELECT ruvector.fastembed('software development', 'all-MiniLM-L6-v2') AS query_emb) q
WHERE embedding IS NOT NULL
  AND metadata->>'category' IS NOT NULL
GROUP BY metadata->>'category'
ORDER BY avg_relevance DESC;

-- Find centroid of embeddings by category
SELECT
    metadata->>'category' AS category,
    COUNT(*) AS count
FROM claude_flow.embeddings
WHERE metadata->>'category' IS NOT NULL
GROUP BY metadata->>'category';


-- ============================================
-- 10. MAINTENANCE
-- ============================================

-- Delete old embeddings
DELETE FROM claude_flow.embeddings
WHERE created_at < NOW() - INTERVAL '30 days';

-- Vacuum and analyze for optimal performance
VACUUM ANALYZE claude_flow.embeddings;
VACUUM ANALYZE claude_flow.patterns;
VACUUM ANALYZE claude_flow.agents;

-- Reindex HNSW (if needed after many updates)
REINDEX INDEX CONCURRENTLY claude_flow.idx_embeddings_hnsw;
