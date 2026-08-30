import { SQLiteBackend, Memory, MemoryQuery } from './SQLiteBackend';
import { AgentDBBackend } from './AgentDBBackend';

export class HybridBackend {
  private sqliteBackend: SQLiteBackend;
  private agentDbBackend: AgentDBBackend;

  constructor() {
    this.sqliteBackend = new SQLiteBackend();
    this.agentDbBackend = new AgentDBBackend();
  }

  async initialize(): Promise<void> {
    await this.sqliteBackend.initialize();
    await this.agentDbBackend.initialize();
  }

  async close(): Promise<void> {
    await this.sqliteBackend.close();
    await this.agentDbBackend.close();
  }

  async store(memory: Memory): Promise<void> {
    await this.sqliteBackend.store(memory);
    if (memory.embedding) {
      await this.agentDbBackend.store(memory);
    }
  }

  async retrieve(id: string): Promise<Memory | undefined> {
    return this.sqliteBackend.retrieve(id);
  }

  async update(memory: Memory): Promise<void> {
    await this.sqliteBackend.update(memory);
    if (memory.embedding) {
      await this.agentDbBackend.store(memory);
    }
  }

  async delete(id: string): Promise<void> {
    await this.sqliteBackend.delete(id);
    await this.agentDbBackend.delete(id);
  }

  async query(query: MemoryQuery): Promise<Memory[]> {
    return this.sqliteBackend.query(query);
  }

  async vectorSearch(embedding: number[], k: number): Promise<Memory[]> {
    return this.agentDbBackend.vectorSearch(embedding, k);
  }

  async hybridSearch(query: MemoryQuery, embedding: number[], k: number): Promise<Memory[]> {
    const filteredByQuery = await this.sqliteBackend.query(query);
    const validIds = new Set(filteredByQuery.map(m => m.id));

    const vectorResults = await this.agentDbBackend.vectorSearch(embedding, validIds.size > 0 ? validIds.size : k * 10);
    
    const combined = vectorResults.filter(m => validIds.has(m.id));
    return combined.slice(0, k);
  }

  async clearAgent(agentId: string): Promise<void> {
    await this.sqliteBackend.clearAgent(agentId);
    await this.agentDbBackend.clearAgent(agentId);
  }

  getStats(): { sqliteCount: number, agentDbCount: number } {
    return {
      sqliteCount: this.sqliteBackend.getCount(),
      agentDbCount: 0 // Placeholder
    };
  }
}
