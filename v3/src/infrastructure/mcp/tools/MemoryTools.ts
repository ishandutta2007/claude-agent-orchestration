import { MCPToolProvider } from '../MCPServer';

export class MemoryTools implements MCPToolProvider {
  private backend: any;

  constructor(backend: any) {
    this.backend = backend;
  }

  getTools(): any[] {
    return [
      { name: 'memory_store', description: 'Store a memory' },
      { name: 'memory_search', description: 'Search memories' },
      { name: 'memory_vector_search', description: 'Vector search memories' },
      { name: 'memory_retrieve', description: 'Retrieve a memory by ID' },
      { name: 'memory_delete', description: 'Delete a memory by ID' }
    ];
  }

  async execute(toolName: string, params: any): Promise<any> {
    switch (toolName) {
      case 'memory_store': return this.storeMemory(params);
      case 'memory_search': return this.searchMemories(params);
      case 'memory_vector_search': return this.vectorSearch(params);
      case 'memory_retrieve': return this.retrieveMemory(params);
      case 'memory_delete': return this.deleteMemory(params);
      default: throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  private async storeMemory(params: any): Promise<any> {
    if (this.backend.store) await this.backend.store(params.memory);
    return { success: true };
  }

  private async searchMemories(params: any): Promise<any> {
    if (this.backend.query) return this.backend.query(params.query);
    return [];
  }

  private async vectorSearch(params: any): Promise<any> {
    if (this.backend.vectorSearch) return this.backend.vectorSearch(params.embedding, params.k);
    return [];
  }

  private async retrieveMemory(params: any): Promise<any> {
    if (this.backend.retrieve) return this.backend.retrieve(params.id);
    return null;
  }

  private async deleteMemory(params: any): Promise<any> {
    if (this.backend.delete) await this.backend.delete(params.id);
    return { success: true };
  }
}
