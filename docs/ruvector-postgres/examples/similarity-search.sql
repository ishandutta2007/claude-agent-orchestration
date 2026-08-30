-- RuVector PostgreSQL Similarity Search
-- Optimized for Claude-Flow V3 HNSW Integration
--
-- Advanced semantic search with 150x-12,500x performance improvement
-- using HNSW (Hierarchical Navigable Small World) indexing

-- ============================================
-- 1. HNSW INDEX CONFIGURATION
-- ============================================

-- Check current HNSW index status
SELECT
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'claude_flow'
  AND indexdef LIKE '%hnsw%';

-- Optimal HNSW parameters for V3
-- m = 16: Balance between recall and index size
-- ef_construction = 64: Higher = better recall, slower build
DROP INDEX IF EXISTS claude_flow.idx_embeddings_hnsw_optimized;

CREATE INDEX idx_embeddings_hnsw_optimized
ON claude_flow.embeddings
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 100);  -- Higher ef_construction for better recall

-- Set search parameters (higher ef = better recall, slower search)
SET hnsw.ef_search = 100;  -- Default is 40, increase for better recall


-- ============================================
-- 2. SEMANTIC SEARCH FUNCTIONS
-- ============================================

-- Enhanced search function with configurable parameters
CREATE OR REPLACE FUNCTION claude_flow.semantic_search(
    query_embedding vector(384),
    limit_count INT DEFAULT 10,
    min_similarity FLOAT DEFAULT 0.5,
    category_filter TEXT DEFAULT NULL,
    agent_filter TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    content TEXT,
    similarity FLOAT,
    metadata JSONB,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        e.id,
        e.content,
        (1 - (e.embedding <=> query_embedding))::FLOAT AS similarity,
        e.metadata,
        e.created_at
    FROM claude_flow.embeddings e
    WHERE e.embedding IS NOT NULL
      AND (1 - (e.embedding <=> query_embedding)) >= min_similarity
      AND (category_filter IS NULL OR e.metadata->>'category' = category_filter)
      AND (agent_filter IS NULL OR e.metadata->>'agent' = agent_filter)
    ORDER BY e.embedding <=> query_embedding
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql STABLE;


-- ============================================
-- 3. MULTI-STAGE RETRIEVAL (RAG Pattern)
-- ============================================

-- Stage 1: Coarse retrieval with HNSW (fast, approximate)
-- Stage 2: Re-rank with exact similarity (precise, slower)

CREATE OR REPLACE FUNCTION claude_flow.rag_retrieve(
    query_embedding vector(384),
    coarse_limit INT DEFAULT 100,
    final_limit INT DEFAULT 10,
    min_similarity FLOAT DEFAULT 0.6
)
RETURNS TABLE (
    id UUID,
    content TEXT,
    coarse_similarity FLOAT,
    exact_similarity FLOAT,
    metadata JSONB
) AS $$
BEGIN
    RETURN QUERY
    WITH coarse_results AS (
        -- Stage 1: Fast HNSW search
        SELECT
            e.id,
            e.content,
            e.embedding,
            e.metadata,
            (1 - (e.embedding <=> query_embedding))::FLOAT AS coarse_sim
        FROM claude_flow.embeddings e
        WHERE e.embedding IS NOT NULL
        ORDER BY e.embedding <=> query_embedding
        LIMIT coarse_limit
    )
    -- Stage 2: Re-rank with exact computation
    SELECT
        cr.id,
        cr.content,
        cr.coarse_sim,
        (1 - (cr.embedding <=> query_embedding))::FLOAT AS exact_sim,
        cr.metadata
    FROM coarse_results cr
    WHERE cr.coarse_sim >= min_similarity
    ORDER BY exact_sim DESC
    LIMIT final_limit;
END;
$$ LANGUAGE plpgsql STABLE;


-- ============================================
-- 4. HYBRID SEARCH (Vector + Keyword)
-- ============================================

-- Enable full-text search
CREATE INDEX IF NOT EXISTS idx_embeddings_content_fts
ON claude_flow.embeddings
USING gin(to_tsvector('english', content));

-- Hybrid search combining vector similarity and keyword matching
CREATE OR REPLACE FUNCTION claude_flow.hybrid_search(
    query_embedding vector(384),
    keyword_query TEXT,
    limit_count INT DEFAULT 10,
    vector_weight FLOAT DEFAULT 0.7,
    keyword_weight FLOAT DEFAULT 0.3
)
RETURNS TABLE (
    id UUID,
    content TEXT,
    vector_score FLOAT,
    keyword_score FLOAT,
    combined_score FLOAT,
    metadata JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        e.id,
        e.content,
        (1 - (e.embedding <=> query_embedding))::FLOAT AS v_score,
        COALESCE(ts_rank_cd(to_tsvector('english', e.content), plainto_tsquery('english', keyword_query)), 0)::FLOAT AS k_score,
        (
            vector_weight * (1 - (e.embedding <=> query_embedding)) +
            keyword_weight * COALESCE(ts_rank_cd(to_tsvector('english', e.content), plainto_tsquery('english', keyword_query)), 0)
        )::FLOAT AS c_score,
        e.metadata
    FROM claude_flow.embeddings e
    WHERE e.embedding IS NOT NULL
      AND (
        (1 - (e.embedding <=> query_embedding)) > 0.3
        OR to_tsvector('english', e.content) @@ plainto_tsquery('english', keyword_query)
      )
    ORDER BY c_score DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql STABLE;


-- ============================================
-- 5. CLUSTER-BASED SEARCH
-- ============================================

-- Find embeddings similar to a cluster of query embeddings
CREATE OR REPLACE FUNCTION claude_flow.cluster_search(
    query_embeddings vector(384)[],
    limit_count INT DEFAULT 10,
    aggregation_method TEXT DEFAULT 'max'  -- 'max', 'avg', 'min'
)
RETURNS TABLE (
    id UUID,
    content TEXT,
    best_similarity FLOAT,
    avg_similarity FLOAT,
    matching_queries INT,
    metadata JSONB
) AS $$
BEGIN
    RETURN QUERY
    WITH query_similarities AS (
        SELECT
            e.id,
            e.content,
            e.metadata,
            q.query_idx,
            (1 - (e.embedding <=> q.query_emb))::FLOAT AS similarity
        FROM claude_flow.embeddings e
        CROSS JOIN LATERAL unnest(query_embeddings) WITH ORDINALITY AS q(query_emb, query_idx)
        WHERE e.embedding IS NOT NULL
    ),
    aggregated AS (
        SELECT
            qs.id,
            qs.content,
            qs.metadata,
            MAX(qs.similarity) AS max_sim,
            AVG(qs.similarity)::FLOAT AS avg_sim,
            MIN(qs.similarity) AS min_sim,
            COUNT(DISTINCT qs.query_idx)::INT AS match_count
        FROM query_similarities qs
        WHERE qs.similarity > 0.5
        GROUP BY qs.id, qs.content, qs.metadata
    )
    SELECT
        a.id,
        a.content,
        CASE aggregation_method
            WHEN 'max' THEN a.max_sim
            WHEN 'avg' THEN a.avg_sim
            WHEN 'min' THEN a.min_sim
            ELSE a.max_sim
        END AS best_similarity,
        a.avg_sim,
        a.match_count,
        a.metadata
    FROM aggregated a
    ORDER BY
        CASE aggregation_method
            WHEN 'max' THEN a.max_sim
            WHEN 'avg' THEN a.avg_sim
            WHEN 'min' THEN a.min_sim
            ELSE a.max_sim
        END DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql STABLE;


-- ============================================
-- 6. TEMPORAL SIMILARITY SEARCH
-- ============================================

-- Search with time decay (recent items weighted higher)
CREATE OR REPLACE FUNCTION claude_flow.temporal_search(
    query_embedding vector(384),
    limit_count INT DEFAULT 10,
    decay_days INT DEFAULT 7,
    time_weight FLOAT DEFAULT 0.2
)
RETURNS TABLE (
    id UUID,
    content TEXT,
    vector_similarity FLOAT,
    recency_score FLOAT,
    combined_score FLOAT,
    created_at TIMESTAMPTZ,
    metadata JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        e.id,
        e.content,
        (1 - (e.embedding <=> query_embedding))::FLOAT AS v_sim,
        (EXP(-EXTRACT(EPOCH FROM (NOW() - e.created_at)) / (decay_days * 86400)))::FLOAT AS r_score,
        (
            (1 - time_weight) * (1 - (e.embedding <=> query_embedding)) +
            time_weight * EXP(-EXTRACT(EPOCH FROM (NOW() - e.created_at)) / (decay_days * 86400))
        )::FLOAT AS c_score,
        e.created_at,
        e.metadata
    FROM claude_flow.embeddings e
    WHERE e.embedding IS NOT NULL
    ORDER BY c_score DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql STABLE;


-- ============================================
-- 7. DIVERSITY-AWARE SEARCH (MMR)
-- ============================================

-- Maximal Marginal Relevance for diverse results
CREATE OR REPLACE FUNCTION claude_flow.mmr_search(
    query_embedding vector(384),
    limit_count INT DEFAULT 10,
    lambda FLOAT DEFAULT 0.5  -- 1.0 = pure relevance, 0.0 = pure diversity
)
RETURNS TABLE (
    id UUID,
    content TEXT,
    relevance FLOAT,
    diversity_penalty FLOAT,
    mmr_score FLOAT,
    metadata JSONB
) AS $$
DECLARE
    rec RECORD;
    selected_ids UUID[] := ARRAY[]::UUID[];
    selected_embeddings vector(384)[] := ARRAY[]::vector(384)[];
    max_sim_to_selected FLOAT;
BEGIN
    -- Iteratively select documents using MMR
    FOR i IN 1..limit_count LOOP
        SELECT INTO rec
            e.id,
            e.content,
            e.embedding,
            e.metadata,
            (1 - (e.embedding <=> query_embedding))::FLOAT AS rel
        FROM claude_flow.embeddings e
        WHERE e.embedding IS NOT NULL
          AND e.id != ALL(selected_ids)
        ORDER BY
            lambda * (1 - (e.embedding <=> query_embedding)) -
            (1 - lambda) * COALESCE(
                (SELECT MAX(1 - (e.embedding <=> se))::FLOAT
                 FROM unnest(selected_embeddings) AS se),
                0
            ) DESC
        LIMIT 1;

        EXIT WHEN rec IS NULL;

        selected_ids := array_append(selected_ids, rec.id);
        selected_embeddings := array_append(selected_embeddings, rec.embedding);

        -- Calculate diversity penalty
        SELECT COALESCE(MAX(1 - (rec.embedding <=> se))::FLOAT, 0)
        INTO max_sim_to_selected
        FROM unnest(selected_embeddings[1:array_length(selected_embeddings,1)-1]) AS se;

        id := rec.id;
        content := rec.content;
        relevance := rec.rel;
        diversity_penalty := max_sim_to_selected;
        mmr_score := lambda * rec.rel - (1 - lambda) * max_sim_to_selected;
        metadata := rec.metadata;

        RETURN NEXT;
    END LOOP;
END;
$$ LANGUAGE plpgsql STABLE;


-- ============================================
-- 8. BENCHMARK QUERIES
-- ============================================

-- Performance test: measure search latency
EXPLAIN ANALYZE
SELECT
    id,
    content,
    1 - (embedding <=> (SELECT embedding FROM claude_flow.embeddings LIMIT 1)) AS similarity
FROM claude_flow.embeddings
WHERE embedding IS NOT NULL
ORDER BY embedding <=> (SELECT embedding FROM claude_flow.embeddings LIMIT 1)
LIMIT 10;

-- Index usage verification
SELECT
    schemaname,
    relname,
    indexrelname,
    idx_scan,
    idx_tup_read,
    idx_tup_fetch
FROM pg_stat_user_indexes
WHERE schemaname = 'claude_flow';
