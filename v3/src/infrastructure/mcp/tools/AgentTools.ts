import { MCPToolProvider, MCPTool, MCPToolResult } from '../../../shared/types/index.js';
import { SwarmCoordinator } from '../../../coordination/application/SwarmCoordinator.js';

/**
 * Tool provider for Agent operations.
 */
export class AgentTools implements MCPToolProvider {
    constructor(private swarmCoordinator: SwarmCoordinator) {}

    public getTools(): MCPTool[] {
        return [
            { name: 'agent_spawn', description: 'Spawn an agent', parameters: { id: 'string', type: 'string', capabilities: 'array' } },
            { name: 'agent_list', description: 'List agents', parameters: {} },
            { name: 'agent_terminate', description: 'Terminate an agent', parameters: { id: 'string' } },
            { name: 'agent_metrics', description: 'Get agent metrics', parameters: { id: 'string' } }
        ];
    }

    public async execute(toolName: string, params: Record<string, unknown>): Promise<MCPToolResult> {
        switch (toolName) {
            case 'agent_spawn': return this.spawn(params);
            case 'agent_list': return this.list(params);
            case 'agent_terminate': return this.terminate(params);
            case 'agent_metrics': return this.metrics(params);
            default: throw new Error(`Unknown tool: ${toolName}`);
        }
    }

    private async spawn(params: Record<string, unknown>): Promise<MCPToolResult> {
        const { id, type, capabilities } = params;
        if (typeof id !== 'string' || !id.trim()) throw new Error('Invalid id');
        if (typeof type !== 'string' || !['worker', 'manager', 'specialist'].includes(type)) throw new Error('Invalid type');
        if (!Array.isArray(capabilities)) throw new Error('Capabilities must be an array');
        
        // Example integration
        // await this.swarmCoordinator.spawnAgent({ id, type, capabilities });
        return { success: true, agent: { id, type, capabilities } as any };
    }

    private async list(params: Record<string, unknown>): Promise<MCPToolResult> {
        return { success: true, agents: [] };
    }

    private async terminate(params: Record<string, unknown>): Promise<MCPToolResult> {
        const { id } = params;
        if (typeof id !== 'string' || !id.trim()) throw new Error('Invalid id');
        return { success: true };
    }

    private async metrics(params: Record<string, unknown>): Promise<MCPToolResult> {
        const { id } = params;
        if (typeof id !== 'string' || !id.trim()) throw new Error('Invalid id');
        return { success: true, metrics: {} };
    }
}
