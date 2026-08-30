import { MCPServerOptions, MCPToolProvider, MCPTool, MCPRequest, MCPResponse } from '../../shared/types/index.js';

/**
 * MCP Server implementation.
 */
export class MCPServer {
    private providers: MCPToolProvider[] = [];
    private toolRegistry: Map<string, MCPTool> = new Map();
    private options: MCPServerOptions;

    /**
     * @param options - Server configuration options
     */
    constructor(options: MCPServerOptions = {}) {
        this.options = options;
        if (options.tools) {
            options.tools.forEach(provider => this.registerProvider(provider));
        }
    }

    public async start(): Promise<void> {
        // Implementation for starting the server
    }

    public async stop(): Promise<void> {
        // Implementation for stopping the server
    }

    /**
     * Registers a tool provider.
     */
    public registerProvider(provider: MCPToolProvider): void {
        this.providers.push(provider);
        if (provider.getTools) {
            const tools = provider.getTools();
            for (const tool of tools) {
                this.toolRegistry.set(tool.name, tool);
            }
        }
    }
    
    /**
     * Registers an individual tool.
     */
    public registerTool(tool: MCPTool, provider: MCPToolProvider): void {
        this.toolRegistry.set(tool.name, tool);
        if (!this.providers.includes(provider)) {
            this.providers.push(provider);
        }
    }

    /**
     * Lists all registered tools.
     */
    public listTools(): MCPTool[] {
        return Array.from(this.toolRegistry.values());
    }

    /**
     * Handles an incoming MCP request.
     */
    public async handleRequest(request: MCPRequest): Promise<MCPResponse> {
        const { id, method, params } = request;
        const tool = this.toolRegistry.get(method);
        
        if (!tool) {
            return {
                id,
                error: { code: -32601, message: `Tool ${method} not found` }
            };
        }

        for (const provider of this.providers) {
            if (provider.getTools && provider.getTools().some(t => t.name === method)) {
                try {
                    const result = await provider.execute(method, params || {});
                    return { id, result };
                } catch (error: any) {
                    return {
                        id,
                        error: { code: -32603, message: error.message || 'Internal error' }
                    };
                }
            }
        }

        return {
            id,
            error: { code: -32603, message: `Provider for ${method} missing` }
        };
    }

    /**
     * Gets the server status.
     */
    public getStatus(): Record<string, unknown> {
        return {
            status: 'running',
            registeredTools: this.listTools().length,
            port: this.options.port,
            host: this.options.host
        };
    }
}
