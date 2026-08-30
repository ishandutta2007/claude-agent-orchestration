import { MemoryBackend, Memory, MemoryQuery, MemorySearchResult } from '../../shared/types/index.js';

/**
 * Agent DB Memory Backend optimized for vector operations.
 */
export class AgentDBBackend implements MemoryBackend {
    private data: Map<string, Memory> = new Map();

    public async initialize(): Promise<void> {}
    public async close(): Promise<void> {}

    public async store(memory: Memory): Promise<Memory> {
        this.data.set(memory.id, memory);
        return memory;
    }

    public async retrieve(id: string): Promise<Memory | undefined> {
        return this.data.get(id);
    }

    public async update(memory: Memory): Promise<void> {
        if (this.data.has(memory.id)) this.data.set(memory.id, memory);
    }

    public async delete(id: string): Promise<void> {
        this.data.delete(id);
    }

    public async query(q: MemoryQuery): Promise<Memory[]> {
        let results = Array.from(this.data.values());
        if (q.agentId) results = results.filter(m => m.agentId === q.agentId);
        if (q.type) results = results.filter(m => m.type === q.type);
        if (q.timeRange) {
            results = results.filter(m => m.timestamp >= q.timeRange!.start && m.timestamp <= q.timeRange!.end);
        }
        if (q.metadata) {
            results = results.filter(m => {
                for (const k in q.metadata) {
                    if (m.metadata?.[k] !== q.metadata[k]) return false;
                }
                return true;
            });
        }
        if (q.offset) results = results.slice(q.offset);
        if (q.limit) results = results.slice(0, q.limit);
        return results;
    }

    public async vectorSearch(vector: number[], limit: number = 10): Promise<MemorySearchResult[]> {
        const results = Array.from(this.data.values())
            .filter(m => m.embedding)
            .map(m => {
                const sim = this.cosineSimilarity(vector, m.embedding!);
                return { ...m, similarity: sim } as MemorySearchResult;
            });
        results.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
        return results.slice(0, limit);
    }

    public async clearAgent(agentId: string): Promise<void> {
        for (const [id, mem] of this.data.entries()) {
            if (mem.agentId === agentId) {
                this.data.delete(id);
            }
        }
    }

    private cosineSimilarity(a: number[], b: number[]): number {
        let dotProduct = 0, normA = 0, normB = 0;
        for (let i = 0; i < Math.min(a.length, b.length); i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        if (normA === 0 || normB === 0) return 0;
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }
}
