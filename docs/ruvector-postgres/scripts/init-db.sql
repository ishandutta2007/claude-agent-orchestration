-- ============================================
-- RUVECTOR POSTGRESQL INITIALIZATION SCRIPT
-- ============================================
--
-- This script initializes RuVector PostgreSQL extension
-- from ruvnet/ruvector-postgres with Claude-Flow V3 integration.
--
-- RuVector 2.0.0 provides 77+ SQL functions including:
-- - Vector similarity search (HNSW with SIMD)
-- - Hyperbolic embeddings (Poincaré/Lorentz)
-- - Graph operations (Cypher queries)
-- - RDF/SPARQL support
-- - Agent routing and learning
--
-- Performance: ~61µs latency, 16,400 QPS

-- ============================================
-- PART 1: EXTENSION AND SCHEMA SETUP
-- ============================================

-- Enable RuVector extension (use VERSION to work around control file issue)
CREATE EXTENSION IF NOT EXISTS ruvector VERSION '0.1.0';

-- Enable additional required extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create the claude_flow schema
CREATE SCHEMA IF NOT EXISTS claude_flow;

-- Grant permissions
GRANT ALL ON SCHEMA claude_flow TO claude;

-- Set search path
SET search_path TO claude_flow, public;

-- ============================================
-- PART 2: CORE TABLES
-- ============================================

-- Embeddings table with RuVector vector type (384-dim for all-MiniLM-L6-v2)
CREATE TABLE IF NOT EXISTS claude_flow.embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content TEXT NOT NULL,
    embedding ruvector(384),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Patterns table for learned patterns (ReasoningBank)
CREATE TABLE IF NOT EXISTS claude_flow.patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    embedding ruvector(384),
    pattern_type VARCHAR(50),
    confidence FLOAT DEFAULT 0.5,
    success_count INT DEFAULT 0,
    failure_count INT DEFAULT 0,
    ewc_importance FLOAT DEFAULT 1.0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agents table for multi-agent memory coordination
CREATE TABLE IF NOT EXISTS claude_flow.agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id VARCHAR(255) NOT NULL UNIQUE,
    agent_type VARCHAR(50),
    state JSONB DEFAULT '{}',
    memory_embedding ruvector(384),
    last_active TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trajectories table for SONA reinforcement learning
CREATE TABLE IF NOT EXISTS claude_flow.trajectories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trajectory_id VARCHAR(255) NOT NULL UNIQUE,
    agent_type VARCHAR(50),
    task_description TEXT,
    status VARCHAR(20) DEFAULT 'in_progress',
    steps JSONB DEFAULT '[]',
    outcome VARCHAR(20),
    quality_score FLOAT,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ
);

-- Hyperbolic embeddings for hierarchical data
CREATE TABLE IF NOT EXISTS claude_flow.hyperbolic_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content TEXT NOT NULL,
    euclidean_embedding ruvector(384),
    poincare_embedding real[],  -- Array for hyperbolic operations
    curvature FLOAT DEFAULT -1.0,
    hierarchy_level INT DEFAULT 0,
    parent_id UUID REFERENCES claude_flow.hyperbolic_embeddings(id),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Graph nodes for GNN operations
CREATE TABLE IF NOT EXISTS claude_flow.graph_nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id VARCHAR(255) NOT NULL UNIQUE,
    node_type VARCHAR(50),
    embedding ruvector(384),
    features JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Graph edges for message passing
CREATE TABLE IF NOT EXISTS claude_flow.graph_edges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID REFERENCES claude_flow.graph_nodes(id),
    target_id UUID REFERENCES claude_flow.graph_nodes(id),
    edge_type VARCHAR(50),
    weight FLOAT DEFAULT 1.0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PART 3: HNSW INDICES
-- ============================================

-- HNSW index for embeddings (cosine distance)
CREATE INDEX IF NOT EXISTS idx_embeddings_hnsw
ON claude_flow.embeddings
USING hnsw (embedding ruvector_cosine_ops)
WITH (m = 16, ef_construction = 100);

-- HNSW index for patterns
CREATE INDEX IF NOT EXISTS idx_patterns_hnsw
ON claude_flow.patterns
USING hnsw (embedding ruvector_cosine_ops)
WITH (m = 16, ef_construction = 100);

-- HNSW index for agent memory
CREATE INDEX IF NOT EXISTS idx_agents_hnsw
ON claude_flow.agents
USING hnsw (memory_embedding ruvector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- HNSW index for hyperbolic embeddings
CREATE INDEX IF NOT EXISTS idx_hyperbolic_hnsw
ON claude_flow.hyperbolic_embeddings
USING hnsw (euclidean_embedding ruvector_cosine_ops)
WITH (m = 16, ef_construction = 100);

-- HNSW index for graph nodes
CREATE INDEX IF NOT EXISTS idx_graph_nodes_hnsw
ON claude_flow.graph_nodes
USING hnsw (embedding ruvector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- ============================================
-- PART 4: CORE SEARCH FUNCTIONS
-- ============================================

-- Semantic similarity search using RuVector HNSW
CREATE OR REPLACE FUNCTION claude_flow.search_similar(
    query_embedding ruvector(384),
    limit_count INT DEFAULT 10,
    min_similarity FLOAT DEFAULT 0.5
)
RETURNS TABLE (
    id UUID,
    content TEXT,
    similarity FLOAT,
    metadata JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        e.id,
        e.content,
        (1 - (e.embedding <=> query_embedding))::FLOAT AS similarity,
        e.metadata
    FROM claude_flow.embeddings e
    WHERE e.embedding IS NOT NULL
      AND (1 - (e.embedding <=> query_embedding)) >= min_similarity
    ORDER BY e.embedding <=> query_embedding
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql STABLE;

-- Pattern search with type filtering
CREATE OR REPLACE FUNCTION claude_flow.search_patterns(
    query_embedding ruvector(384),
    pattern_type_filter VARCHAR(50) DEFAULT NULL,
    limit_count INT DEFAULT 10,
    min_confidence FLOAT DEFAULT 0.5
)
RETURNS TABLE (
    id UUID,
    name VARCHAR(255),
    description TEXT,
    similarity FLOAT,
    confidence FLOAT,
    metadata JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.id,
        p.name,
        p.description,
        (1 - (p.embedding <=> query_embedding))::FLOAT AS similarity,
        p.confidence,
        p.metadata
    FROM claude_flow.patterns p
    WHERE p.embedding IS NOT NULL
      AND p.confidence >= min_confidence
      AND (pattern_type_filter IS NULL OR p.pattern_type = pattern_type_filter)
    ORDER BY p.embedding <=> query_embedding
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql STABLE;

-- Agent routing by expertise similarity
CREATE OR REPLACE FUNCTION claude_flow.find_agents(
    query_embedding ruvector(384),
    agent_type_filter VARCHAR(50) DEFAULT NULL,
    limit_count INT DEFAULT 5
)
RETURNS TABLE (
    agent_id VARCHAR(255),
    agent_type VARCHAR(50),
    similarity FLOAT,
    state JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        a.agent_id,
        a.agent_type,
        (1 - (a.memory_embedding <=> query_embedding))::FLOAT AS similarity,
        a.state
    FROM claude_flow.agents a
    WHERE a.memory_embedding IS NOT NULL
      AND (agent_type_filter IS NULL OR a.agent_type = agent_type_filter)
    ORDER BY a.memory_embedding <=> query_embedding
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- PART 5: HYPERBOLIC OPERATIONS
-- ============================================

-- Convert Euclidean to Poincaré embedding
CREATE OR REPLACE FUNCTION claude_flow.to_poincare(
    euclidean real[],
    curvature FLOAT DEFAULT -1.0
)
RETURNS real[] AS $$
BEGIN
    RETURN ruvector_exp_map(ARRAY_FILL(0.0::real, ARRAY[array_length(euclidean, 1)]), euclidean, curvature);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Poincaré distance (geodesic)
CREATE OR REPLACE FUNCTION claude_flow.poincare_distance(
    x real[],
    y real[],
    curvature FLOAT DEFAULT -1.0
)
RETURNS FLOAT AS $$
BEGIN
    RETURN ruvector_poincare_distance(x, y, curvature);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Hyperbolic search in Poincaré ball
CREATE OR REPLACE FUNCTION claude_flow.hyperbolic_search(
    query ruvector(384),
    limit_count INT DEFAULT 10,
    curvature FLOAT DEFAULT -1.0
)
RETURNS TABLE (
    id UUID,
    content TEXT,
    euclidean_dist FLOAT,
    hyperbolic_dist FLOAT,
    hierarchy_level INT,
    metadata JSONB
) AS $$
DECLARE
    query_arr real[];
    query_poincare real[];
BEGIN
    -- Convert query to array and then to Poincaré
    SELECT array_agg(x ORDER BY ordinality) INTO query_arr
    FROM unnest(string_to_array(trim(both '[]' from query::text), ',')) WITH ORDINALITY AS t(x, ordinality);

    query_poincare := claude_flow.to_poincare(query_arr, curvature);

    RETURN QUERY
    SELECT
        he.id,
        he.content,
        (he.euclidean_embedding <-> query)::FLOAT AS euc_dist,
        COALESCE(ruvector_poincare_distance(he.poincare_embedding, query_poincare, curvature), 999.0)::FLOAT AS hyp_dist,
        he.hierarchy_level,
        he.metadata
    FROM claude_flow.hyperbolic_embeddings he
    WHERE he.euclidean_embedding IS NOT NULL
    ORDER BY he.euclidean_embedding <-> query
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- PART 6: UTILITY FUNCTIONS
-- ============================================

-- Get RuVector version info
CREATE OR REPLACE FUNCTION claude_flow.ruvector_info()
RETURNS TABLE (
    version TEXT,
    simd_info TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT ruvector_version(), ruvector_simd_info();
END;
$$ LANGUAGE plpgsql STABLE;

-- Cosine similarity helper (converts cosine distance to similarity)
CREATE OR REPLACE FUNCTION claude_flow.cosine_similarity(
    a ruvector,
    b ruvector
)
RETURNS FLOAT AS $$
BEGIN
    RETURN (1 - (a <=> b))::FLOAT;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- L2 distance helper
CREATE OR REPLACE FUNCTION claude_flow.l2_distance(
    a ruvector,
    b ruvector
)
RETURNS FLOAT AS $$
BEGIN
    RETURN (a <-> b)::FLOAT;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Update embedding with auto-timestamp
CREATE OR REPLACE FUNCTION claude_flow.update_embedding(
    embedding_id UUID,
    new_content TEXT DEFAULT NULL,
    new_embedding ruvector(384) DEFAULT NULL,
    new_metadata JSONB DEFAULT NULL
)
RETURNS void AS $$
BEGIN
    UPDATE claude_flow.embeddings
    SET
        content = COALESCE(new_content, content),
        embedding = COALESCE(new_embedding, embedding),
        metadata = COALESCE(new_metadata, metadata),
        updated_at = NOW()
    WHERE id = embedding_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- PART 7: SAMPLE DATA
-- ============================================

-- Insert sample embeddings (without actual vectors - those need to come from model)
INSERT INTO claude_flow.embeddings (content, metadata) VALUES
    ('Implementing JWT authentication with refresh token rotation',
     '{"category": "security", "language": "typescript", "agent": "security-architect"}'),
    ('Building a RESTful API with Express and TypeScript',
     '{"category": "backend", "language": "typescript", "agent": "coder"}'),
    ('Setting up RuVector PostgreSQL for semantic search',
     '{"category": "database", "language": "sql", "agent": "architect"}'),
    ('HNSW indexing for sub-millisecond vector search',
     '{"category": "performance", "language": "sql", "agent": "perf-engineer"}'),
    ('TDD London School approach with mocks',
     '{"category": "testing", "language": "typescript", "agent": "tester"}'),
    ('Multi-head attention mechanism in transformer architectures',
     '{"category": "ai", "language": "python", "agent": "ml-developer"}'),
    ('Graph neural networks for knowledge representation',
     '{"category": "ai", "language": "python", "agent": "ml-developer"}'),
    ('Hyperbolic embeddings for hierarchical data',
     '{"category": "ai", "language": "python", "agent": "researcher"}'),
    ('BM25 ranking for hybrid search optimization',
     '{"category": "search", "language": "sql", "agent": "perf-engineer"}'),
    ('Multi-agent swarm coordination patterns',
     '{"category": "ai", "language": "typescript", "agent": "architect"}')
ON CONFLICT DO NOTHING;

-- Insert sample agents
INSERT INTO claude_flow.agents (agent_id, agent_type, state) VALUES
    ('coder-001', 'coder', '{"specializations": ["typescript", "react"], "tasks_completed": 42}'),
    ('architect-001', 'architect', '{"specializations": ["system-design", "ddd"], "tasks_completed": 28}'),
    ('tester-001', 'tester', '{"specializations": ["tdd", "integration"], "tasks_completed": 35}'),
    ('security-001', 'security-architect', '{"specializations": ["auth", "crypto"], "tasks_completed": 15}'),
    ('perf-001', 'perf-engineer', '{"specializations": ["database", "caching"], "tasks_completed": 22}')
ON CONFLICT (agent_id) DO UPDATE SET last_active = NOW();

-- Insert sample patterns
INSERT INTO claude_flow.patterns (name, pattern_type, description, confidence) VALUES
    ('jwt-refresh-rotation', 'security', 'JWT with secure refresh token rotation', 0.92),
    ('hnsw-search-pattern', 'performance', 'HNSW index for vector similarity search', 0.95),
    ('tdd-london-mocks', 'testing', 'London School TDD with mocks first', 0.85),
    ('hierarchical-swarm', 'coordination', 'Anti-drift hierarchical swarm topology', 0.90),
    ('gnn-message-passing', 'ai', 'GNN message aggregation pattern', 0.88)
ON CONFLICT DO NOTHING;

-- ============================================
-- COMPLETION
-- ============================================

DO $$
DECLARE
    v_version TEXT;
    v_simd TEXT;
BEGIN
    SELECT ruvector_version() INTO v_version;
    SELECT ruvector_simd_info() INTO v_simd;

    RAISE NOTICE '';
    RAISE NOTICE '============================================';
    RAISE NOTICE 'RuVector PostgreSQL Initialization Complete!';
    RAISE NOTICE '============================================';
    RAISE NOTICE '';
    RAISE NOTICE 'RuVector Version: %', v_version;
    RAISE NOTICE 'SIMD: %', v_simd;
    RAISE NOTICE '';
    RAISE NOTICE 'Schema: claude_flow';
    RAISE NOTICE 'Tables: embeddings, patterns, agents, trajectories,';
    RAISE NOTICE '        hyperbolic_embeddings, graph_nodes, graph_edges';
    RAISE NOTICE 'Indices: 5 HNSW indices created';
    RAISE NOTICE '';
    RAISE NOTICE 'Key Functions:';
    RAISE NOTICE '  - claude_flow.search_similar(embedding, limit, min_sim)';
    RAISE NOTICE '  - claude_flow.search_patterns(embedding, type, limit)';
    RAISE NOTICE '  - claude_flow.find_agents(embedding, type, limit)';
    RAISE NOTICE '  - claude_flow.hyperbolic_search(embedding, limit, curvature)';
    RAISE NOTICE '  - claude_flow.cosine_similarity(a, b)';
    RAISE NOTICE '';
    RAISE NOTICE 'Operators: <=> (cosine), <-> (L2), <#> (neg inner product)';
    RAISE NOTICE '';
END $$;
