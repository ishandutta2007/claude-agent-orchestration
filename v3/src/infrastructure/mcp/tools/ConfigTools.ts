import type { MCPTool, MCPToolProvider, MCPToolResult } from '../../../shared/types/index.js';

export interface V3Config {
  swarm?: {
    topology?: 'hierarchical' | 'mesh' | 'simple' | 'adaptive';
    maxAgents?: number;
    leaderElection?: boolean;
  };
  memory?: {
    backend?: 'hybrid' | 'agentdb' | 'sqlite';
    ttl?: number;
    maxSize?: number;
  };
  performance?: {
    flashAttention?: boolean;
    targetSpeedup?: string;
    concurrency?: number;
  };
}

export class ConfigTools implements MCPToolProvider {
  private configs: Map<string, V3Config> = new Map();

  getTools(): MCPTool[] {
    return [
      { name: 'config_load', description: 'Load configuration from a path', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
      { name: 'config_save', description: 'Save configuration to a path', parameters: { type: 'object', properties: { path: { type: 'string' }, config: { type: 'object' } }, required: ['path', 'config'] } },
      { name: 'config_validate', description: 'Validate a configuration', parameters: { type: 'object', properties: { config: { type: 'object' } }, required: ['config'] } },
      { name: 'config_get', description: 'Get current configuration', parameters: { type: 'object', properties: { path: { type: 'string' } } } }
    ];
  }

  async execute(toolName: string, params: Record<string, unknown>): Promise<MCPToolResult> {
    try {
      switch (toolName) {
        case 'config_load': return { success: true, config: this.loadConfig(params.path as string) };
        case 'config_save': {
          this.saveConfig(params.path as string, params.config as V3Config);
          return { success: true };
        }
        case 'config_validate': {
          const errors = this.validate(params.config as V3Config);
          return { success: errors.length === 0, valid: errors.length === 0, errors };
        }
        case 'config_get': return { success: true, config: params.path ? this.configs.get(params.path as string) || this.getDefaultConfig() : this.getDefaultConfig() };
        default: return { success: false, error: `Unknown tool: ${toolName}` };
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  loadConfig(path: string): V3Config {
    return this.configs.get(path) || this.getDefaultConfig();
  }

  saveConfig(path: string, config: V3Config): void {
    this.configs.set(path, config);
  }

  private validate(config: V3Config): string[] {
    const errors: string[] = [];
    const validTopologies = ['hierarchical', 'mesh', 'simple', 'adaptive'];
    if (config.swarm?.topology && !validTopologies.includes(config.swarm.topology)) {
      errors.push(`Invalid swarm.topology: ${config.swarm.topology}. Must be one of: ${validTopologies.join(', ')}`);
    }
    const validBackends = ['hybrid', 'agentdb', 'sqlite'];
    if (config.memory?.backend && !validBackends.includes(config.memory.backend)) {
      errors.push(`Invalid memory.backend: ${config.memory.backend}. Must be one of: ${validBackends.join(', ')}`);
    }
    return errors;
  }

  private getDefaultConfig(): V3Config {
    return {
      swarm: { topology: 'hierarchical', maxAgents: 10, leaderElection: true },
      memory: { backend: 'hybrid', ttl: 3600000, maxSize: 1000000 },
      performance: { flashAttention: true, targetSpeedup: '2.49x-7.47x', concurrency: 4 }
    };
  }
}

export { ConfigTools as default };
