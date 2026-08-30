export interface MCPToolProvider {
  getTools(): any[];
  execute(toolName: string, params: any): Promise<any>;
}

export interface MCPServerOptions {
  tools: MCPToolProvider[];
  port?: number;
  host?: string;
}

export interface MCPRequest {
  jsonrpc: string;
  id: string | number;
  method: string;
  params?: any;
}

export interface MCPResponse {
  jsonrpc: string;
  id: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

/**
 * MCPServer handles tool registration, provider routing, and JSON-RPC.
 */
export class MCPServer {
  private options: MCPServerOptions;
  private running: boolean = false;
  private toolRegistry: Map<string, MCPToolProvider> = new Map();

  constructor(options: MCPServerOptions) {
    this.options = {
      port: options.port || 3000,
      host: options.host || 'localhost',
      tools: options.tools
    };
  }

  async start(): Promise<void> {
    this.toolRegistry.clear();
    for (const provider of this.options.tools) {
      const tools = provider.getTools();
      for (const tool of tools) {
        this.toolRegistry.set(tool.name, provider);
      }
    }
    this.running = true;
  }

  async stop(): Promise<void> {
    this.toolRegistry.clear();
    this.running = false;
  }

  registerTool(toolProvider: MCPToolProvider): void {
    const tools = toolProvider.getTools();
    for (const tool of tools) {
      this.toolRegistry.set(tool.name, toolProvider);
    }
    this.options.tools.push(toolProvider);
  }

  listTools(): any[] {
    const allTools: any[] = [];
    for (const provider of new Set(this.toolRegistry.values())) {
      allTools.push(...provider.getTools());
    }
    return allTools;
  }

  async handleRequest(request: MCPRequest): Promise<MCPResponse> {
    if (request.method !== 'mcp.executeTool') {
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: { code: -32601, message: 'Method not found' }
      };
    }

    const { toolName, params } = request.params || {};
    if (!toolName) {
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: { code: -32602, message: 'Invalid params: missing toolName' }
      };
    }

    const provider = this.toolRegistry.get(toolName);
    if (!provider) {
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: { code: -32601, message: `Tool ${toolName} not found` }
      };
    }

    try {
      const result = await provider.execute(toolName, params);
      return {
        jsonrpc: '2.0',
        id: request.id,
        result
      };
    } catch (error: any) {
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: { code: -32603, message: 'Internal error', data: error.message }
      };
    }
  }

  getStatus(): any {
    return {
      running: this.running,
      port: this.options.port,
      host: this.options.host,
      toolCount: this.toolRegistry.size
    };
  }
}
