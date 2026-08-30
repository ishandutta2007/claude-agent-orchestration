import { Memory } from './SQLiteBackend';

export class AgentDBBackend {
  private memories: Map<string, Memory> = new Map();
  private dimensions: number = 1536;

  async initialize(): Promise<void> {}
  async close(): Promise<void> { this.memories.clear(); }

  async store(memory: Memory): Promise<void> {
    if (memory.embedding && memory.embedding.length !== this.dimensions && this.memories.size === 0) {
        this.dimensions = memory.embedding.length;
    }
    this.memories.set(memory.id, memory);
  }

  async retrieve(id: string): Promise<Memory | undefined> {
    return this.memories.get(id);
  }

  async delete(id: string): Promise<void> {
    this.memories.delete(id);
  }

  async vectorSearch(embedding: number[], k: number): Promise<Memory[]> {
    const results = Array.from(this.memories.values()).filter(m => m.embedding);
    
    results.sort((a, b) => this.cosineSimilarity(embedding, b.embedding!) - this.cosineSimilarity(embedding, a.embedding!));
    return results.slice(0, k);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0, normA = 0, normB = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return normA === 0 || normB === 0 ? 0 : dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  async clearAgent(agentId: string): Promise<void> {
    for (const [id, mem] of this.memories.entries()) {
      if (mem.agentId === agentId) {
        this.memories.delete(id);
      }
    }
  }
}
