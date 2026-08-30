-- RuVector PostgreSQL Attention Operations
-- Optimized for Claude-Flow V3 Neural Features
--
-- Implements attention mechanisms in SQL for:
-- - Self-attention (query = key = value)
-- - Multi-head attention
-- - Cross-attention
-- - Flash attention patterns

-- ============================================
-- 1. ATTENTION SCORE COMPUTATION
-- ============================================

-- Basic attention score: softmax(Q * K^T / sqrt(d_k)) * V
-- Using cosine similarity as a proxy for dot product attention

CREATE OR REPLACE FUNCTION claude_flow.attention_scores(
    query_embedding vector(384),
    limit_count INT DEFAULT 10,
    temperature FLOAT DEFAULT 1.0
)
RETURNS TABLE (
    id UUID,
    content TEXT,
    raw_score FLOAT,
    attention_weight FLOAT,
    metadata JSONB
) AS $$
DECLARE
    softmax_sum FLOAT;
BEGIN
    -- Calculate softmax denominator
    SELECT SUM(EXP((1 - (embedding <=> query_embedding)) / temperature))
    INTO softmax_sum
    FROM claude_flow.embeddings
    WHERE embedding IS NOT NULL;

    RETURN QUERY
    SELECT
        e.id,
        e.content,
        (1 - (e.embedding <=> query_embedding))::FLOAT AS r_score,
        (EXP((1 - (e.embedding <=> query_embedding)) / temperature) / NULLIF(softmax_sum, 0))::FLOAT AS a_weight,
        e.metadata
    FROM claude_flow.embeddings e
    WHERE e.embedding IS NOT NULL
    ORDER BY a_weight DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql STABLE;


-- ============================================
-- 2. SELF-ATTENTION LAYER
-- ============================================

-- Self-attention: each embedding attends to all others
CREATE OR REPLACE FUNCTION claude_flow.self_attention(
    source_ids UUID[],
    head_count INT DEFAULT 4,
    temperature FLOAT DEFAULT 1.0
)
RETURNS TABLE (
    source_id UUID,
    attended_id UUID,
    head_idx INT,
    attention_score FLOAT,
    source_content TEXT,
    attended_content TEXT
) AS $$
BEGIN
    RETURN QUERY
    WITH source_embeddings AS (
        SELECT id, content, embedding
        FROM claude_flow.embeddings
        WHERE id = ANY(source_ids)
          AND embedding IS NOT NULL
    ),
    all_pairs AS (
        SELECT
            s.id AS s_id,
            s.content AS s_content,
            s.embedding AS s_emb,
            t.id AS t_id,
            t.content AS t_content,
            t.embedding AS t_emb,
            h.head_idx AS h_idx
        FROM source_embeddings s
        CROSS JOIN claude_flow.embeddings t
        CROSS JOIN generate_series(1, head_count) AS h(head_idx)
        WHERE t.embedding IS NOT NULL
    ),
    raw_scores AS (
        SELECT
            ap.s_id,
            ap.s_content,
            ap.t_id,
            ap.t_content,
            ap.h_idx,
            (1 - (ap.s_emb <=> ap.t_emb))::FLOAT AS score
        FROM all_pairs ap
    ),
    softmax_scores AS (
        SELECT
            rs.s_id,
            rs.s_content,
            rs.t_id,
            rs.t_content,
            rs.h_idx,
            rs.score,
            EXP(rs.score / temperature) /
                SUM(EXP(rs.score / temperature)) OVER (PARTITION BY rs.s_id, rs.h_idx) AS attn_score
        FROM raw_scores rs
    )
    SELECT
        ss.s_id,
        ss.t_id,
        ss.h_idx,
        ss.attn_score::FLOAT,
        ss.s_content,
        ss.t_content
    FROM softmax_scores ss
    WHERE ss.attn_score > 0.01  -- Filter low attention
    ORDER BY ss.s_id, ss.h_idx, ss.attn_score DESC;
END;
$$ LANGUAGE plpgsql STABLE;


-- ============================================
-- 3. CROSS-ATTENTION
-- ============================================

-- Cross-attention between two sets of embeddings
CREATE OR REPLACE FUNCTION claude_flow.cross_attention(
    query_ids UUID[],
    key_value_filter JSONB DEFAULT NULL,
    temperature FLOAT DEFAULT 1.0
)
RETURNS TABLE (
    query_id UUID,
    key_id UUID,
    attention_weight FLOAT,
    query_content TEXT,
    key_content TEXT,
    key_metadata JSONB
) AS $$
BEGIN
    RETURN QUERY
    WITH queries AS (
        SELECT id, content, embedding
        FROM claude_flow.embeddings
        WHERE id = ANY(query_ids)
          AND embedding IS NOT NULL
    ),
    keys AS (
        SELECT id, content, embedding, metadata
        FROM claude_flow.embeddings
        WHERE embedding IS NOT NULL
          AND (key_value_filter IS NULL OR metadata @> key_value_filter)
          AND id != ALL(query_ids)
    ),
    raw_attention AS (
        SELECT
            q.id AS q_id,
            q.content AS q_content,
            k.id AS k_id,
            k.content AS k_content,
            k.metadata AS k_meta,
            (1 - (q.embedding <=> k.embedding))::FLOAT AS score
        FROM queries q
        CROSS JOIN keys k
    ),
    softmax_attention AS (
        SELECT
            ra.*,
            EXP(ra.score / temperature) /
                SUM(EXP(ra.score / temperature)) OVER (PARTITION BY ra.q_id) AS attn_weight
        FROM raw_attention ra
    )
    SELECT
        sa.q_id,
        sa.k_id,
        sa.attn_weight::FLOAT,
        sa.q_content,
        sa.k_content,
        sa.k_meta
    FROM softmax_attention sa
    WHERE sa.attn_weight > 0.01
    ORDER BY sa.q_id, sa.attn_weight DESC;
END;
$$ LANGUAGE plpgsql STABLE;


-- ============================================
-- 4. MULTI-HEAD ATTENTION AGGREGATION
-- ============================================

-- Aggregate multi-head attention outputs
CREATE OR REPLACE FUNCTION claude_flow.multihead_attention_aggregate(
    query_embedding vector(384),
    num_heads INT DEFAULT 8,
    head_dim INT DEFAULT 48,  -- 384 / 8
    limit_count INT DEFAULT 10
)
RETURNS TABLE (
    id UUID,
    content TEXT,
    aggregated_attention FLOAT,
    head_attentions FLOAT[],
    metadata JSONB
) AS $$
BEGIN
    RETURN QUERY
    WITH per_head_attention AS (
        SELECT
            e.id,
            e.content,
            e.metadata,
            h.head_idx,
            -- Simulate head projection by using different parts of the embedding
            (1 - (
                subvector(e.embedding, (h.head_idx - 1) * head_dim + 1, head_dim) <=>
                subvector(query_embedding, (h.head_idx - 1) * head_dim + 1, head_dim)
            ))::FLOAT AS head_score
        FROM claude_flow.embeddings e
        CROSS JOIN generate_series(1, num_heads) AS h(head_idx)
        WHERE e.embedding IS NOT NULL
    ),
    aggregated AS (
        SELECT
            pha.id,
            pha.content,
            pha.metadata,
            AVG(pha.head_score)::FLOAT AS avg_attention,
            array_agg(pha.head_score ORDER BY pha.head_idx) AS head_scores
        FROM per_head_attention pha
        GROUP BY pha.id, pha.content, pha.metadata
    )
    SELECT
        a.id,
        a.content,
        a.avg_attention,
        a.head_scores,
        a.metadata
    FROM aggregated a
    ORDER BY a.avg_attention DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql STABLE;


-- ============================================
-- 5. FLASH ATTENTION PATTERN (Block-wise)
-- ============================================

-- Simulates Flash Attention by processing in blocks
-- Reduces memory usage for large-scale attention

CREATE OR REPLACE FUNCTION claude_flow.flash_attention_search(
    query_embedding vector(384),
    block_size INT DEFAULT 64,
    limit_count INT DEFAULT 10
)
RETURNS TABLE (
    id UUID,
    content TEXT,
    attention_score FLOAT,
    block_id INT,
    metadata JSONB
) AS $$
BEGIN
    RETURN QUERY
    WITH numbered_embeddings AS (
        SELECT
            e.id,
            e.content,
            e.embedding,
            e.metadata,
            ROW_NUMBER() OVER (ORDER BY e.created_at) AS row_num
        FROM claude_flow.embeddings e
        WHERE e.embedding IS NOT NULL
    ),
    blocked AS (
        SELECT
            ne.*,
            ((ne.row_num - 1) / block_size + 1)::INT AS blk_id
        FROM numbered_embeddings ne
    ),
    block_max AS (
        -- Find max score per block (for numerical stability)
        SELECT
            b.blk_id,
            MAX(1 - (b.embedding <=> query_embedding))::FLOAT AS max_score
        FROM blocked b
        GROUP BY b.blk_id
    ),
    block_attention AS (
        SELECT
            b.id,
            b.content,
            b.embedding,
            b.metadata,
            b.blk_id,
            (1 - (b.embedding <=> query_embedding))::FLOAT AS raw_score,
            bm.max_score,
            EXP((1 - (b.embedding <=> query_embedding)) - bm.max_score) AS stable_exp
        FROM blocked b
        JOIN block_max bm ON b.blk_id = bm.blk_id
    ),
    block_sums AS (
        SELECT
            blk_id,
            SUM(stable_exp) AS sum_exp
        FROM block_attention
        GROUP BY blk_id
    ),
    final_attention AS (
        SELECT
            ba.id,
            ba.content,
            ba.metadata,
            ba.blk_id,
            (ba.stable_exp / NULLIF(bs.sum_exp, 0))::FLOAT AS attn_score
        FROM block_attention ba
        JOIN block_sums bs ON ba.blk_id = bs.blk_id
    )
    SELECT
        fa.id,
        fa.content,
        fa.attn_score,
        fa.blk_id,
        fa.metadata
    FROM final_attention fa
    ORDER BY fa.attn_score DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql STABLE;


-- ============================================
-- 6. ATTENTION-WEIGHTED RETRIEVAL
-- ============================================

-- Use attention to weight context retrieval for RAG
CREATE OR REPLACE FUNCTION claude_flow.attention_weighted_retrieve(
    query_embedding vector(384),
    context_window INT DEFAULT 5,
    attention_threshold FLOAT DEFAULT 0.1
)
RETURNS TABLE (
    context_text TEXT,
    total_attention FLOAT,
    contributing_ids UUID[]
) AS $$
BEGIN
    RETURN QUERY
    WITH attention_scores AS (
        SELECT
            e.id,
            e.content,
            (1 - (e.embedding <=> query_embedding))::FLOAT AS score
        FROM claude_flow.embeddings e
        WHERE e.embedding IS NOT NULL
    ),
    softmax_attention AS (
        SELECT
            a.id,
            a.content,
            a.score,
            (a.score / NULLIF(SUM(a.score) OVER (), 0))::FLOAT AS attention_weight
        FROM attention_scores a
    ),
    filtered AS (
        SELECT *
        FROM softmax_attention sa
        WHERE sa.attention_weight >= attention_threshold
        ORDER BY sa.attention_weight DESC
        LIMIT context_window
    )
    SELECT
        string_agg(f.content, E'\n\n' ORDER BY f.attention_weight DESC) AS ctx_text,
        SUM(f.attention_weight)::FLOAT AS total_attn,
        array_agg(f.id ORDER BY f.attention_weight DESC) AS contrib_ids
    FROM filtered f;
END;
$$ LANGUAGE plpgsql STABLE;


-- ============================================
-- 7. CAUSAL ATTENTION MASK
-- ============================================

-- Attention with causal masking (only attend to earlier items)
CREATE OR REPLACE FUNCTION claude_flow.causal_attention(
    source_ids UUID[],
    temperature FLOAT DEFAULT 1.0
)
RETURNS TABLE (
    source_id UUID,
    attended_id UUID,
    attention_score FLOAT,
    source_created TIMESTAMPTZ,
    attended_created TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    WITH sources AS (
        SELECT id, content, embedding, created_at
        FROM claude_flow.embeddings
        WHERE id = ANY(source_ids)
          AND embedding IS NOT NULL
    ),
    causal_pairs AS (
        SELECT
            s.id AS s_id,
            s.embedding AS s_emb,
            s.created_at AS s_created,
            t.id AS t_id,
            t.embedding AS t_emb,
            t.created_at AS t_created,
            (1 - (s.embedding <=> t.embedding))::FLOAT AS score
        FROM sources s
        JOIN claude_flow.embeddings t ON t.created_at <= s.created_at  -- Causal mask
        WHERE t.embedding IS NOT NULL
    ),
    softmax_scores AS (
        SELECT
            cp.*,
            EXP(cp.score / temperature) /
                SUM(EXP(cp.score / temperature)) OVER (PARTITION BY cp.s_id) AS attn
        FROM causal_pairs cp
    )
    SELECT
        ss.s_id,
        ss.t_id,
        ss.attn::FLOAT,
        ss.s_created,
        ss.t_created
    FROM softmax_scores ss
    WHERE ss.attn > 0.01
    ORDER BY ss.s_id, ss.attn DESC;
END;
$$ LANGUAGE plpgsql STABLE;


-- ============================================
-- 8. ATTENTION VISUALIZATION HELPER
-- ============================================

-- Generate attention matrix for visualization
CREATE OR REPLACE FUNCTION claude_flow.attention_matrix(
    embedding_ids UUID[],
    temperature FLOAT DEFAULT 1.0
)
RETURNS TABLE (
    row_id UUID,
    col_id UUID,
    row_idx INT,
    col_idx INT,
    attention_value FLOAT
) AS $$
BEGIN
    RETURN QUERY
    WITH indexed AS (
        SELECT
            e.id,
            e.embedding,
            ROW_NUMBER() OVER (ORDER BY array_position(embedding_ids, e.id)) AS idx
        FROM claude_flow.embeddings e
        WHERE e.id = ANY(embedding_ids)
          AND e.embedding IS NOT NULL
    ),
    pairs AS (
        SELECT
            i1.id AS r_id,
            i1.idx AS r_idx,
            i2.id AS c_id,
            i2.idx AS c_idx,
            (1 - (i1.embedding <=> i2.embedding))::FLOAT AS score
        FROM indexed i1
        CROSS JOIN indexed i2
    ),
    softmax AS (
        SELECT
            p.*,
            EXP(p.score / temperature) /
                SUM(EXP(p.score / temperature)) OVER (PARTITION BY p.r_id) AS attn
        FROM pairs p
    )
    SELECT
        s.r_id,
        s.c_id,
        s.r_idx::INT,
        s.c_idx::INT,
        s.attn::FLOAT
    FROM softmax s
    ORDER BY s.r_idx, s.c_idx;
END;
$$ LANGUAGE plpgsql STABLE;
