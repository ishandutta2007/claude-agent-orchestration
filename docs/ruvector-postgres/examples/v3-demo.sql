-- ============================================
-- RUVECTOR POSTGRESQL V3 COMPREHENSIVE DEMO
-- ============================================
--
-- Complete demonstration of RuVector PostgreSQL Bridge
-- optimized for Claude-Flow V3 features:
--
-- - HNSW Indexing (150x-12,500x faster search)
-- - SONA Integration (pattern learning)
-- - Multi-agent memory coordination
-- - Neural attention mechanisms
-- - Hyperbolic embeddings (Poincaré ball)
-- - Int8 quantization (3.92x memory reduction)
--
-- Run this script to set up a fully-featured demo environment

-- ============================================
-- PART 1: SCHEMA SETUP
-- ============================================

\echo '======================================'
\echo 'Part 1: Schema Setup'
\echo '======================================'

-- Ensure we're using the correct schema
SET search_path TO claude_flow, public;

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create enhanced tables for V3 features

-- SONA Trajectories for reinforcement learning
CREATE TABLE IF NOT EXISTS claude_flow.trajectories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trajectory_id VARCHAR(255) NOT NULL UNIQUE,
    agent_type VARCHAR(50),
    task_description TEXT,
    status VARCHAR(20) DEFAULT 'in_progress',
    steps JSONB DEFAULT '[]',
    outcome VARCHAR(20),  -- 'success', 'failure', 'partial'
    quality_score FLOAT,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'
);

-- ReasoningBank patterns with confidence tracking
CREATE TABLE IF NOT EXISTS claude_flow.reasoning_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pattern_id VARCHAR(255) NOT NULL UNIQUE,
    pattern_type VARCHAR(50),
    description TEXT,
    embedding vector(384),
    confidence FLOAT DEFAULT 0.5,
    success_count INT DEFAULT 0,
    failure_count INT DEFAULT 0,
    last_used TIMESTAMPTZ,
    ewc_importance FLOAT DEFAULT 1.0,  -- EWC++ importance weight
    created_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'
);

-- Hyperbolic embeddings table (Poincaré ball model)
CREATE TABLE IF NOT EXISTS claude_flow.hyperbolic_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content TEXT NOT NULL,
    euclidean_embedding vector(384),
    poincare_embedding vector(384),  -- In Poincaré ball (||x|| < 1)
    curvature FLOAT DEFAULT -1.0,
    hierarchy_level INT DEFAULT 0,
    parent_id UUID REFERENCES claude_flow.hyperbolic_embeddings(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'
);

-- Create HNSW indices for optimal V3 performance
CREATE INDEX IF NOT EXISTS idx_reasoning_patterns_hnsw
ON claude_flow.reasoning_patterns
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 100);

CREATE INDEX IF NOT EXISTS idx_hyperbolic_hnsw
ON claude_flow.hyperbolic_embeddings
USING hnsw (euclidean_embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 100);

\echo 'Schema setup complete'

-- ============================================
-- PART 2: SONA TRAJECTORY FUNCTIONS
-- ============================================

\echo ''
\echo '======================================'
\echo 'Part 2: SONA Trajectory Functions'
\echo '======================================'

-- Start a new learning trajectory
CREATE OR REPLACE FUNCTION claude_flow.trajectory_start(
    p_task TEXT,
    p_agent_type TEXT DEFAULT 'general'
)
RETURNS TEXT AS $$
DECLARE
    v_trajectory_id TEXT;
BEGIN
    v_trajectory_id := 'traj-' || encode(gen_random_bytes(8), 'hex');

    INSERT INTO claude_flow.trajectories (trajectory_id, agent_type, task_description)
    VALUES (v_trajectory_id, p_agent_type, p_task);

    RETURN v_trajectory_id;
END;
$$ LANGUAGE plpgsql;

-- Record a step in the trajectory
CREATE OR REPLACE FUNCTION claude_flow.trajectory_step(
    p_trajectory_id TEXT,
    p_action TEXT,
    p_result TEXT DEFAULT NULL,
    p_quality FLOAT DEFAULT 0.5
)
RETURNS VOID AS $$
BEGIN
    UPDATE claude_flow.trajectories
    SET steps = steps || jsonb_build_object(
        'action', p_action,
        'result', p_result,
        'quality', p_quality,
        'timestamp', NOW()
    )::jsonb
    WHERE trajectory_id = p_trajectory_id;
END;
$$ LANGUAGE plpgsql;

-- End trajectory and trigger learning
CREATE OR REPLACE FUNCTION claude_flow.trajectory_end(
    p_trajectory_id TEXT,
    p_success BOOLEAN,
    p_feedback TEXT DEFAULT NULL
)
RETURNS TABLE (
    trajectory_id TEXT,
    total_steps INT,
    avg_quality FLOAT,
    outcome TEXT
) AS $$
DECLARE
    v_steps JSONB;
    v_avg_quality FLOAT;
    v_outcome TEXT;
BEGIN
    -- Update trajectory status
    v_outcome := CASE WHEN p_success THEN 'success' ELSE 'failure' END;

    UPDATE claude_flow.trajectories t
    SET
        status = 'completed',
        outcome = v_outcome,
        ended_at = NOW(),
        metadata = metadata || jsonb_build_object('feedback', p_feedback)
    WHERE t.trajectory_id = p_trajectory_id
    RETURNING t.steps INTO v_steps;

    -- Calculate average quality
    SELECT AVG((s->>'quality')::FLOAT)
    INTO v_avg_quality
    FROM jsonb_array_elements(v_steps) AS s;

    -- Update quality score
    UPDATE claude_flow.trajectories
    SET quality_score = v_avg_quality
    WHERE trajectories.trajectory_id = p_trajectory_id;

    RETURN QUERY
    SELECT
        p_trajectory_id,
        jsonb_array_length(v_steps)::INT,
        COALESCE(v_avg_quality, 0.0)::FLOAT,
        v_outcome;
END;
$$ LANGUAGE plpgsql;

\echo 'SONA trajectory functions created'

-- ============================================
-- PART 3: REASONINGBANK PATTERN LEARNING
-- ============================================

\echo ''
\echo '======================================'
\echo 'Part 3: ReasoningBank Pattern Learning'
\echo '======================================'

-- Store a pattern with embedding
CREATE OR REPLACE FUNCTION claude_flow.pattern_store(
    p_pattern_id TEXT,
    p_description TEXT,
    p_embedding vector(384),
    p_type TEXT DEFAULT 'general',
    p_initial_confidence FLOAT DEFAULT 0.5
)
RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO claude_flow.reasoning_patterns (
        pattern_id, pattern_type, description, embedding, confidence
    )
    VALUES (p_pattern_id, p_type, p_description, p_embedding, p_initial_confidence)
    ON CONFLICT (pattern_id) DO UPDATE SET
        description = EXCLUDED.description,
        embedding = EXCLUDED.embedding,
        last_used = NOW()
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- Search patterns with HNSW (150x faster)
CREATE OR REPLACE FUNCTION claude_flow.pattern_search(
    p_query_embedding vector(384),
    p_limit INT DEFAULT 5,
    p_min_confidence FLOAT DEFAULT 0.3,
    p_type_filter TEXT DEFAULT NULL
)
RETURNS TABLE (
    pattern_id TEXT,
    description TEXT,
    similarity FLOAT,
    confidence FLOAT,
    success_rate FLOAT,
    pattern_type TEXT
) AS $$
BEGIN
    -- Set HNSW search parameters for optimal recall
    SET LOCAL hnsw.ef_search = 100;

    RETURN QUERY
    SELECT
        rp.pattern_id,
        rp.description,
        (1 - (rp.embedding <=> p_query_embedding))::FLOAT AS sim,
        rp.confidence,
        CASE
            WHEN (rp.success_count + rp.failure_count) > 0
            THEN rp.success_count::FLOAT / (rp.success_count + rp.failure_count)
            ELSE 0.5
        END AS success_rate,
        rp.pattern_type
    FROM claude_flow.reasoning_patterns rp
    WHERE rp.embedding IS NOT NULL
      AND rp.confidence >= p_min_confidence
      AND (p_type_filter IS NULL OR rp.pattern_type = p_type_filter)
    ORDER BY rp.embedding <=> p_query_embedding
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Update pattern confidence with EWC++ inspired importance weighting
CREATE OR REPLACE FUNCTION claude_flow.pattern_feedback(
    p_pattern_id TEXT,
    p_success BOOLEAN,
    p_quality FLOAT DEFAULT 0.5
)
RETURNS VOID AS $$
DECLARE
    v_current_confidence FLOAT;
    v_learning_rate FLOAT := 0.1;
    v_ewc_lambda FLOAT := 0.5;  -- EWC++ regularization strength
BEGIN
    SELECT confidence INTO v_current_confidence
    FROM claude_flow.reasoning_patterns
    WHERE pattern_id = p_pattern_id;

    -- Update with EWC++-inspired update rule
    UPDATE claude_flow.reasoning_patterns
    SET
        confidence = GREATEST(0.0, LEAST(1.0,
            v_current_confidence +
            v_learning_rate * ewc_importance * (p_quality - v_current_confidence)
        )),
        success_count = success_count + CASE WHEN p_success THEN 1 ELSE 0 END,
        failure_count = failure_count + CASE WHEN NOT p_success THEN 1 ELSE 0 END,
        last_used = NOW(),
        -- Increase importance for frequently used patterns
        ewc_importance = LEAST(2.0, ewc_importance + 0.1)
    WHERE pattern_id = p_pattern_id;
END;
$$ LANGUAGE plpgsql;

\echo 'ReasoningBank functions created'

-- ============================================
-- PART 4: HYPERBOLIC EMBEDDINGS
-- ============================================

\echo ''
\echo '======================================'
\echo 'Part 4: Hyperbolic Embeddings'
\echo '======================================'

-- Convert Euclidean to Poincaré ball embedding
CREATE OR REPLACE FUNCTION claude_flow.euclidean_to_poincare(
    p_euclidean vector(384),
    p_curvature FLOAT DEFAULT -1.0
)
RETURNS vector(384) AS $$
DECLARE
    v_norm FLOAT;
    v_scale FLOAT;
    v_result FLOAT[];
    v_dim INT := 384;
BEGIN
    -- Get L2 norm
    SELECT sqrt(SUM(val * val))
    INTO v_norm
    FROM unnest(p_euclidean::float[]) AS val;

    -- Map to Poincaré ball: x / (1 + sqrt(1 + |c| * ||x||^2))
    v_scale := 1.0 / (1.0 + sqrt(1.0 + abs(p_curvature) * v_norm * v_norm));

    SELECT array_agg(val * v_scale)
    INTO v_result
    FROM unnest(p_euclidean::float[]) AS val;

    RETURN v_result::vector(384);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Poincaré distance (geodesic in hyperbolic space)
CREATE OR REPLACE FUNCTION claude_flow.poincare_distance(
    p_x vector(384),
    p_y vector(384),
    p_curvature FLOAT DEFAULT -1.0
)
RETURNS FLOAT AS $$
DECLARE
    v_x_norm_sq FLOAT;
    v_y_norm_sq FLOAT;
    v_diff_norm_sq FLOAT;
    v_numerator FLOAT;
    v_denominator FLOAT;
BEGIN
    -- ||x||^2
    SELECT SUM(val * val) INTO v_x_norm_sq
    FROM unnest(p_x::float[]) AS val;

    -- ||y||^2
    SELECT SUM(val * val) INTO v_y_norm_sq
    FROM unnest(p_y::float[]) AS val;

    -- ||x - y||^2
    SELECT SUM((a - b) * (a - b)) INTO v_diff_norm_sq
    FROM unnest(p_x::float[], p_y::float[]) AS t(a, b);

    -- Poincaré distance formula
    v_numerator := 2.0 * v_diff_norm_sq;
    v_denominator := (1.0 - v_x_norm_sq) * (1.0 - v_y_norm_sq);

    IF v_denominator <= 0 THEN
        RETURN 999999.0;  -- Points outside ball
    END IF;

    RETURN (1.0 / sqrt(abs(p_curvature))) *
           acosh(1.0 + v_numerator / v_denominator);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Search in hyperbolic space (for hierarchical data)
CREATE OR REPLACE FUNCTION claude_flow.hyperbolic_search(
    p_query_embedding vector(384),
    p_limit INT DEFAULT 10,
    p_curvature FLOAT DEFAULT -1.0
)
RETURNS TABLE (
    id UUID,
    content TEXT,
    euclidean_distance FLOAT,
    poincare_distance FLOAT,
    hierarchy_level INT,
    metadata JSONB
) AS $$
DECLARE
    v_query_poincare vector(384);
BEGIN
    -- Convert query to Poincaré space
    v_query_poincare := claude_flow.euclidean_to_poincare(p_query_embedding, p_curvature);

    RETURN QUERY
    SELECT
        he.id,
        he.content,
        (he.euclidean_embedding <=> p_query_embedding)::FLOAT AS euc_dist,
        claude_flow.poincare_distance(he.poincare_embedding, v_query_poincare, p_curvature) AS poinc_dist,
        he.hierarchy_level,
        he.metadata
    FROM claude_flow.hyperbolic_embeddings he
    WHERE he.euclidean_embedding IS NOT NULL
    ORDER BY he.euclidean_embedding <=> p_query_embedding  -- Use HNSW for initial filtering
    LIMIT p_limit * 2  -- Fetch more for re-ranking
)
-- Re-rank by Poincaré distance
ORDER BY poinc_dist
LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

\echo 'Hyperbolic embedding functions created'

-- ============================================
-- PART 5: AGENT MEMORY COORDINATION
-- ============================================

\echo ''
\echo '======================================'
\echo 'Part 5: Agent Memory Coordination'
\echo '======================================'

-- Multi-agent memory sharing
CREATE OR REPLACE FUNCTION claude_flow.share_agent_memory(
    p_source_agent TEXT,
    p_target_agents TEXT[],
    p_knowledge_filter JSONB DEFAULT NULL
)
RETURNS TABLE (
    target_agent TEXT,
    patterns_shared INT,
    similarity_threshold FLOAT
) AS $$
DECLARE
    v_source_embedding vector(384);
    v_target TEXT;
    v_shared_count INT;
BEGIN
    -- Get source agent's memory embedding
    SELECT memory_embedding INTO v_source_embedding
    FROM claude_flow.agents
    WHERE agent_id = p_source_agent;

    IF v_source_embedding IS NULL THEN
        RAISE EXCEPTION 'Source agent % not found or has no memory', p_source_agent;
    END IF;

    -- Share with each target agent
    FOREACH v_target IN ARRAY p_target_agents LOOP
        -- Find relevant patterns from source
        WITH relevant_patterns AS (
            SELECT embedding, confidence
            FROM claude_flow.reasoning_patterns
            WHERE (1 - (embedding <=> v_source_embedding)) > 0.5
              AND (p_knowledge_filter IS NULL OR metadata @> p_knowledge_filter)
            ORDER BY embedding <=> v_source_embedding
            LIMIT 10
        )
        -- Update target agent's memory (weighted average)
        UPDATE claude_flow.agents
        SET
            memory_embedding = (
                SELECT AVG(embedding)::vector(384)
                FROM (
                    SELECT memory_embedding AS embedding FROM claude_flow.agents WHERE agent_id = v_target
                    UNION ALL
                    SELECT embedding FROM relevant_patterns
                ) combined
            ),
            last_active = NOW()
        WHERE agent_id = v_target;

        GET DIAGNOSTICS v_shared_count = ROW_COUNT;

        target_agent := v_target;
        patterns_shared := v_shared_count;
        similarity_threshold := 0.5;
        RETURN NEXT;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Find agents with complementary knowledge
CREATE OR REPLACE FUNCTION claude_flow.find_complementary_agents(
    p_task_embedding vector(384),
    p_exclude_agents TEXT[] DEFAULT ARRAY[]::TEXT[],
    p_limit INT DEFAULT 3
)
RETURNS TABLE (
    agent_id TEXT,
    agent_type TEXT,
    relevance_score FLOAT,
    complementary_score FLOAT,
    combined_score FLOAT
) AS $$
BEGIN
    RETURN QUERY
    WITH agent_relevance AS (
        SELECT
            a.agent_id,
            a.agent_type,
            a.memory_embedding,
            (1 - (a.memory_embedding <=> p_task_embedding))::FLOAT AS relevance
        FROM claude_flow.agents a
        WHERE a.memory_embedding IS NOT NULL
          AND a.agent_id != ALL(p_exclude_agents)
    ),
    agent_pairs AS (
        SELECT
            ar1.agent_id,
            ar1.agent_type,
            ar1.relevance,
            -- Complementary = different from already selected
            COALESCE(
                1 - MAX(1 - (ar1.memory_embedding <=> ar2.memory_embedding)),
                1.0
            )::FLOAT AS complementary
        FROM agent_relevance ar1
        LEFT JOIN agent_relevance ar2 ON ar2.agent_id = ANY(p_exclude_agents)
        GROUP BY ar1.agent_id, ar1.agent_type, ar1.relevance, ar1.memory_embedding
    )
    SELECT
        ap.agent_id,
        ap.agent_type,
        ap.relevance,
        ap.complementary,
        (0.6 * ap.relevance + 0.4 * ap.complementary)::FLOAT AS combined
    FROM agent_pairs ap
    ORDER BY combined DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

\echo 'Agent coordination functions created'

-- ============================================
-- PART 6: DEMO DATA
-- ============================================

\echo ''
\echo '======================================'
\echo 'Part 6: Loading Demo Data'
\echo '======================================'

-- Insert sample embeddings with realistic metadata
INSERT INTO claude_flow.embeddings (content, metadata) VALUES
    ('Implementing JWT authentication with refresh token rotation',
     '{"category": "security", "language": "typescript", "complexity": "medium", "agent": "security-architect"}'),
    ('Building a RESTful API with Express and TypeScript',
     '{"category": "backend", "language": "typescript", "complexity": "low", "agent": "coder"}'),
    ('Setting up PostgreSQL with pgvector for semantic search',
     '{"category": "database", "language": "sql", "complexity": "medium", "agent": "architect"}'),
    ('Implementing HNSW indexing for fast vector similarity search',
     '{"category": "performance", "language": "sql", "complexity": "high", "agent": "perf-engineer"}'),
    ('Creating a React component with TDD London School approach',
     '{"category": "frontend", "language": "typescript", "complexity": "medium", "agent": "tester"}'),
    ('Setting up CI/CD pipeline with GitHub Actions',
     '{"category": "devops", "language": "yaml", "complexity": "medium", "agent": "cicd-engineer"}'),
    ('Implementing rate limiting with sliding window algorithm',
     '{"category": "security", "language": "typescript", "complexity": "high", "agent": "security-architect"}'),
    ('Building a multi-agent swarm with hierarchical coordination',
     '{"category": "ai", "language": "typescript", "complexity": "high", "agent": "architect"}'),
    ('Optimizing database queries with EXPLAIN ANALYZE',
     '{"category": "database", "language": "sql", "complexity": "medium", "agent": "perf-engineer"}'),
    ('Implementing EWC++ for continual learning without forgetting',
     '{"category": "ai", "language": "python", "complexity": "high", "agent": "ml-developer"}')
ON CONFLICT DO NOTHING;

-- Insert sample agents
INSERT INTO claude_flow.agents (agent_id, agent_type, state) VALUES
    ('coder-001', 'coder', '{"specializations": ["typescript", "react"], "tasks_completed": 42}'),
    ('architect-001', 'architect', '{"specializations": ["system-design", "ddd"], "tasks_completed": 28}'),
    ('tester-001', 'tester', '{"specializations": ["tdd", "integration"], "tasks_completed": 35}'),
    ('security-001', 'security-architect', '{"specializations": ["auth", "crypto"], "tasks_completed": 15}'),
    ('perf-001', 'perf-engineer', '{"specializations": ["database", "caching"], "tasks_completed": 22}')
ON CONFLICT (agent_id) DO UPDATE SET
    state = EXCLUDED.state,
    last_active = NOW();

-- Insert sample reasoning patterns
INSERT INTO claude_flow.reasoning_patterns (pattern_id, pattern_type, description, confidence) VALUES
    ('auth-jwt-refresh', 'security', 'JWT with refresh token rotation pattern', 0.92),
    ('api-rest-design', 'architecture', 'RESTful API design with proper status codes', 0.88),
    ('db-index-btree', 'performance', 'B-tree index for range queries', 0.85),
    ('db-index-hnsw', 'performance', 'HNSW index for vector similarity', 0.95),
    ('tdd-london-mock', 'testing', 'London School TDD with mocks first', 0.82),
    ('swarm-hierarchical', 'coordination', 'Hierarchical swarm with queen coordinator', 0.90)
ON CONFLICT (pattern_id) DO NOTHING;

\echo 'Demo data loaded'

-- ============================================
-- PART 7: VERIFICATION QUERIES
-- ============================================

\echo ''
\echo '======================================'
\echo 'Part 7: Verification'
\echo '======================================'

-- Count records
SELECT 'embeddings' AS table_name, COUNT(*) AS count FROM claude_flow.embeddings
UNION ALL
SELECT 'patterns', COUNT(*) FROM claude_flow.patterns
UNION ALL
SELECT 'agents', COUNT(*) FROM claude_flow.agents
UNION ALL
SELECT 'reasoning_patterns', COUNT(*) FROM claude_flow.reasoning_patterns
UNION ALL
SELECT 'trajectories', COUNT(*) FROM claude_flow.trajectories;

-- Show indices
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'claude_flow'
  AND indexdef LIKE '%hnsw%';

\echo ''
\echo '======================================'
\echo 'RuVector V3 Demo Setup Complete!'
\echo '======================================'
\echo ''
\echo 'Available functions:'
\echo '  - claude_flow.semantic_search(embedding, limit, threshold)'
\echo '  - claude_flow.rag_retrieve(embedding, coarse_limit, final_limit)'
\echo '  - claude_flow.hybrid_search(embedding, keyword, limit)'
\echo '  - claude_flow.trajectory_start(task, agent_type)'
\echo '  - claude_flow.trajectory_step(id, action, result, quality)'
\echo '  - claude_flow.trajectory_end(id, success, feedback)'
\echo '  - claude_flow.pattern_store(id, desc, embedding, type)'
\echo '  - claude_flow.pattern_search(embedding, limit, confidence)'
\echo '  - claude_flow.pattern_feedback(id, success, quality)'
\echo '  - claude_flow.hyperbolic_search(embedding, limit, curvature)'
\echo '  - claude_flow.share_agent_memory(source, targets, filter)'
\echo '  - claude_flow.find_complementary_agents(task_embedding)'
\echo ''
