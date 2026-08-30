export interface Memory {
  id: string;
  agentId: string;
  type: string;
  content: string;
  timestamp: number;
  metadata?: any;
  embedding?: number[];
}

export interface MemoryQuery {
  agentId?: string;
  type?: string;
  timeRange?: { start?: number; end?: number };
  metadata?: any;
  limit?: number;
  offset?: number;
}

export class SQLiteBackend {
  private memories: Map<string, Memory> = new Map();

  async initialize(): Promise<void> {}
  async close(): Promise<void> { this.memories.clear(); }

  async store(memory: Memory): Promise<void> {
    this.memories.set(memory.id, memory);
  }

  async retrieve(id: string): Promise<Memory | undefined> {
    return this.memories.get(id);
  }

  async update(memory: Memory): Promise<void> {
    if (this.memories.has(memory.id)) {
      this.memories.set(memory.id, memory);
    }
  }

  async delete(id: string): Promise<void> {
    this.memories.delete(id);
  }

  async query(query: MemoryQuery): Promise<Memory[]> {
    let results = Array.from(this.memories.values());

    if (query.agentId) {
      results = results.filter(m => m.agentId === query.agentId);
    }
    if (query.type) {
      results = results.filter(m => m.type === query.type);
    }
    if (query.timeRange) {
      if (query.timeRange.start !== undefined) {
        results = results.filter(m => m.timestamp >= query.timeRange!.start!);
      }
      if (query.timeRange.end !== undefined) {
        results = results.filter(m => m.timestamp <= query.timeRange!.end!);
      }
    }
    
    if (query.metadata) {
      const keys = Object.keys(query.metadata);
      results = results.filter(m => {
        if (!m.metadata) return false;
        return keys.every(k => m.metadata![k] === query.metadata![k]);
      });
    }

    const offset = query.offset || 0;
    const limit = query.limit || results.length;
    return results.slice(offset, offset + limit);
  }

  async vectorSearch(embedding: number[], k: number): Promise<Memory[]> {
    const results = Array.from(this.memories.values()).filter(m => m.embedding);
    
    const cosineSim = (a: number[], b: number[]) => {
      let dot = 0, normA = 0, normB = 0;
      for (let i = 0; i < a.length; i++) {
        dot += a[i] * (b[i] || 0);
        normA += a[i] * a[i];
        normB += (b[i] || 0) * (b[i] || 0);
      }
      return dot / (Math.sqrt(normA) * Math.sqrt(normB));
    };

    results.sort((a, b) => cosineSim(embedding, b.embedding!) - cosineSim(embedding, a.embedding!));
    return results.slice(0, k);
  }

  async clearAgent(agentId: string): Promise<void> {
    for (const [id, mem] of this.memories.entries()) {
      if (mem.agentId === agentId) {
        this.memories.delete(id);
      }
    }
  }

  getCount(): number {
    return this.memories.size;
  }
}
