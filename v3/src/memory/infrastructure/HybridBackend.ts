import { MemoryBackend, Memory, MemoryQuery, MemorySearchResult } from '../../shared/types/index.js';
import { SQLiteBackend } from './SQLiteBackend.js';
import { AgentDBBackend } from './AgentDBBackend.js';

/**
 * Hybrid Memory Backend that composes SQLite and AgentDB backends.
 */
export class HybridBackend implements MemoryBackend {
    private sqlite = new SQLiteBackend();
    private agentDb = new AgentDBBackend();

    public async initialize(): Promise<void> {
        await this.sqlite.initialize();
        await this.agentDb.initialize();
    }

    public async close(): Promise<void> {
        await this.sqlite.close();
        await this.agentDb.close();
    }

    public async store(memory: Memory): Promise<Memory> {
        await this.sqlite.store(memory);
        if (memory.embedding && memory.embedding.length > 0) {
            await this.agentDb.store(memory);
        }
        return memory;
    }

    public async retrieve(id: string): Promise<Memory | undefined> {
        return this.sqlite.retrieve(id);
    }

    public async update(memory: Memory): Promise<void> {
        await this.sqlite.update(memory);
        if (memory.embedding) {
            await this.agentDb.update(memory);
        }
    }

    public async delete(id: string): Promise<void> {
        await this.sqlite.delete(id);
        await this.agentDb.delete(id);
    }

    public async query(q: MemoryQuery): Promise<Memory[]> {
        return this.sqlite.query(q);
    }

    public async vectorSearch(vector: number[], limit: number = 10): Promise<MemorySearchResult[]> {
        return this.agentDb.vectorSearch(vector, limit);
    }

    public async hybridSearch(query: MemoryQuery, vector: number[], limit: number = 10): Promise<MemorySearchResult[]> {
        const sqlResults = await this.sqlite.query(query);
        const sqlIds = new Set(sqlResults.map(r => r.id));
        
        const vectorResults = await this.agentDb.vectorSearch(vector, limit * 2);
        
        return vectorResults
            .filter(vr => sqlIds.has(vr.id))
            .slice(0, limit);
    }

    public async clearAgent(agentId: string): Promise<void> {
        await this.sqlite.clearAgent(agentId);
        await this.agentDb.clearAgent(agentId);
    }
    
    public getStats(): Record<string, unknown> {
        return {
            sqliteRecords: this.sqlite.getCount(),
            hybridMode: true
        };
    }
}
