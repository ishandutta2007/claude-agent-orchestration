import { MCPToolProvider, MCPTool, MCPToolResult, MemoryBackend, Memory } from '../../../shared/types/index.js';

/**
 * Tool provider for Memory operations.
 */
export class MemoryTools implements MCPToolProvider {
    constructor(private backend: MemoryBackend) {}

    public getTools(): MCPTool[] {
        return [
            { name: 'memory_store', description: 'Store memory', parameters: { memory: 'object' } },
            { name: 'memory_search', description: 'Search memory', parameters: { query: 'object' } },
            { name: 'memory_vector_search', description: 'Vector search memory', parameters: { vector: 'array', limit: 'number' } },
            { name: 'memory_retrieve', description: 'Retrieve memory', parameters: { id: 'string' } },
            { name: 'memory_delete', description: 'Delete memory', parameters: { id: 'string' } }
        ];
    }

    public async execute(toolName: string, params: Record<string, unknown>): Promise<MCPToolResult> {
        switch (toolName) {
            case 'memory_store': {
                const mem = await this.backend.store(params.memory as Memory);
                return { success: true, results: [mem] };
            }
            case 'memory_search': {
                const results = await this.backend.query(params.query as any);
                return { success: true, results };
            }
            case 'memory_vector_search': {
                const res = await this.backend.vectorSearch(params.vector as number[], params.limit as number);
                return { success: true, results: res };
            }
            case 'memory_retrieve': {
                const mem = await this.backend.retrieve(params.id as string);
                return { success: true, results: mem ? [mem] : [] };
            }
            case 'memory_delete': {
                await this.backend.delete(params.id as string);
                return { success: true };
            }
            default:
                throw new Error(`Unknown tool: ${toolName}`);
        }
    }
}
