/**
 * Claude Flow V3 Main Index
 *
 * Exports all public APIs for the V3 modular architecture.
 */

// Shared Types
export * from './shared/types/index.js';

// Domain Entities
export { Agent } from './agent-lifecycle/domain/Agent.js';
export { Task } from './task-execution/domain/Task.js';
export { MemoryEntity, type Memory } from './memory/domain/Memory.js';

// Application Services
export { SwarmCoordinator, type SwarmCoordinatorOptions } from './coordination/application/SwarmCoordinator.js';
export { WorkflowEngine, type WorkflowEngineOptions } from './task-execution/application/WorkflowEngine.js';

// Memory Infrastructure
export { HybridBackend } from './memory/infrastructure/HybridBackend.js';
export { SQLiteBackend } from './memory/infrastructure/SQLiteBackend.js';
export { AgentDBBackend } from './memory/infrastructure/AgentDBBackend.js';

// Plugin Infrastructure
export { PluginManager, type PluginManagerOptions } from './infrastructure/plugins/PluginManager.js';
export { BasePlugin, type Plugin, type ExtensionPoint } from './infrastructure/plugins/Plugin.js';

// MCP Infrastructure
export { MCPServer } from './infrastructure/mcp/MCPServer.js';
export { AgentTools } from './infrastructure/mcp/tools/AgentTools.js';
export { MemoryTools } from './infrastructure/mcp/tools/MemoryTools.js';
export { ConfigTools } from './infrastructure/mcp/tools/ConfigTools.js';
