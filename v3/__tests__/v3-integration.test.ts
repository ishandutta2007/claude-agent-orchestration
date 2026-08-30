/**
 * Claude Flow V3 - Integration Test Suite
 *
 * Tests the core functionality of the V3 modular architecture:
 * - Agent lifecycle (spawn, execute, terminate)
 * - Task management (creation, dependency resolution, execution)
 * - Swarm coordination (distribution, topology, consensus)
 * - Workflow engine (sequential, parallel, rollback)
 * - Memory backend (store, query, vector search)
 * - MCP server (request routing, tool execution)
 * - Plugin system (load, extension points, unload)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Agent } from '../src/agent-lifecycle/domain/Agent';
import { Task } from '../src/task-execution/domain/Task';
import { MemoryEntity } from '../src/memory/domain/Memory';
import { SwarmCoordinator } from '../src/coordination/application/SwarmCoordinator';
import { WorkflowEngine } from '../src/task-execution/application/WorkflowEngine';
import { SQLiteBackend } from '../src/memory/infrastructure/SQLiteBackend';
import { AgentDBBackend } from '../src/memory/infrastructure/AgentDBBackend';
import { HybridBackend } from '../src/memory/infrastructure/HybridBackend';
import { MCPServer } from '../src/infrastructure/mcp/MCPServer';
import { AgentTools } from '../src/infrastructure/mcp/tools/AgentTools';
import { MemoryTools } from '../src/infrastructure/mcp/tools/MemoryTools';
import { ConfigTools } from '../src/infrastructure/mcp/tools/ConfigTools';
import { PluginManager } from '../src/infrastructure/plugins/PluginManager';
import { BasePlugin } from '../src/infrastructure/plugins/Plugin';

// =============================================================================
// Agent Tests
// =============================================================================

describe('Agent', () => {
  let agent: Agent;

  beforeEach(() => {
    agent = new Agent({
      id: 'test-agent',
      type: 'coder',
      capabilities: ['code', 'refactor', 'debug']
    });
  });

  it('should initialize with active status', () => {
    expect(agent.id).toBe('test-agent');
    expect(agent.type).toBe('coder');
    expect(agent.status).toBe('active');
    expect(agent.capabilities).toEqual(['code', 'refactor', 'debug']);
  });

  it('should execute tasks successfully', async () => {
    let executed = false;
    const task = {
      id: 'task-1',
      type: 'code' as const,
      description: 'Test task',
      priority: 'high' as const,
      onExecute: async () => { executed = true; }
    };

    const result = await agent.executeTask(task);
    expect(result.status).toBe('completed');
    expect(result.taskId).toBe('task-1');
    expect(result.agentId).toBe('test-agent');
    expect(executed).toBe(true);
    expect(agent.status).toBe('active');
  });

  it('should fail task when agent is terminated', async () => {
    agent.terminate();
    const task = {
      id: 'task-1',
      type: 'code' as const,
      description: 'Test task',
      priority: 'high' as const
    };

    const result = await agent.executeTask(task);
    expect(result.status).toBe('failed');
  });

  it('should check capabilities correctly', () => {
    expect(agent.hasCapability('code')).toBe(true);
    expect(agent.hasCapability('deploy')).toBe(false);
    expect(agent.canExecute('code')).toBe(true);
    expect(agent.canExecute('deploy')).toBe(false);
  });

  it('should manage lifecycle states', () => {
    agent.setIdle();
    expect(agent.status).toBe('idle');

    agent.activate();
    expect(agent.status).toBe('active');

    agent.terminate();
    expect(agent.status).toBe('terminated');

    // Cannot activate once terminated
    agent.activate();
    expect(agent.status).toBe('terminated');
  });

  it('should serialize to JSON', () => {
    const json = agent.toJSON();
    expect(json.id).toBe('test-agent');
    expect(json.type).toBe('coder');
    expect(json.status).toBe('active');
    expect(json.createdAt).toBeDefined();
  });
});

// =============================================================================
// Task Tests
// =============================================================================

describe('Task', () => {
  it('should initialize with correct defaults', () => {
    const task = new Task({
      id: 'task-1',
      type: 'code',
      description: 'Test task',
      priority: 'high'
    });

    expect(task.id).toBe('task-1');
    expect(task.status).toBe('pending');
    expect(task.dependencies).toEqual([]);
  });

  it('should manage lifecycle states', () => {
    const task = new Task({
      id: 'task-1',
      type: 'code',
      description: 'Test',
      priority: 'medium'
    });

    task.start();
    expect(task.status).toBe('in-progress');

    task.complete();
    expect(task.status).toBe('completed');
    expect(task.getDuration()).toBeDefined();
  });

  it('should resolve dependencies', () => {
    const task = new Task({
      id: 'task-3',
      type: 'test',
      description: 'Test',
      priority: 'low',
      dependencies: ['task-1', 'task-2']
    });

    expect(task.areDependenciesResolved(new Set(['task-1']))).toBe(false);
    expect(task.areDependenciesResolved(new Set(['task-1', 'task-2']))).toBe(true);
  });

  it('should sort tasks by priority', () => {
    const tasks = [
      new Task({ id: 't1', type: 'code', description: '', priority: 'low' }),
      new Task({ id: 't2', type: 'code', description: '', priority: 'high' }),
      new Task({ id: 't3', type: 'code', description: '', priority: 'medium' })
    ];

    const sorted = Task.sortByPriority(tasks);
    expect(sorted[0].id).toBe('t2'); // high
    expect(sorted[1].id).toBe('t3'); // medium
    expect(sorted[2].id).toBe('t1'); // low
  });

  it('should resolve execution order with dependencies', () => {
    const tasks = [
      new Task({ id: 'build', type: 'code', description: '', priority: 'high', dependencies: ['design'] }),
      new Task({ id: 'test', type: 'test', description: '', priority: 'medium', dependencies: ['build'] }),
      new Task({ id: 'design', type: 'design', description: '', priority: 'low' })
    ];

    const order = Task.resolveExecutionOrder(tasks);
    expect(order[0].id).toBe('design');
    expect(order[1].id).toBe('build');
    expect(order[2].id).toBe('test');
  });

  it('should detect circular dependencies', () => {
    const tasks = [
      new Task({ id: 'a', type: 'code', description: '', priority: 'high', dependencies: ['b'] }),
      new Task({ id: 'b', type: 'code', description: '', priority: 'high', dependencies: ['a'] })
    ];

    expect(() => Task.resolveExecutionOrder(tasks)).toThrow('Circular dependency');
  });
});

// =============================================================================
// Memory Tests
// =============================================================================

describe('MemoryEntity', () => {
  it('should create task memory', () => {
    const memory = MemoryEntity.createTaskMemory('agent-1', 'Task context data', 'task-123');
    expect(memory.agentId).toBe('agent-1');
    expect(memory.type).toBe('task');
    expect(memory.content).toBe('Task context data');
  });

  it('should detect embeddings', () => {
    const memory = new MemoryEntity({
      id: 'mem-1',
      agentId: 'agent-1',
      content: 'test',
      type: 'context',
      timestamp: Date.now(),
      embedding: [0.1, 0.2, 0.3]
    });

    expect(memory.hasEmbedding()).toBe(true);
    expect(memory.getEmbeddingDimension()).toBe(3);
  });

  it('should match queries', () => {
    const memory = new MemoryEntity({
      id: 'mem-1',
      agentId: 'agent-1',
      content: 'test',
      type: 'context',
      timestamp: Date.now()
    });

    expect(memory.matches({ agentId: 'agent-1' })).toBe(true);
    expect(memory.matches({ agentId: 'agent-2' })).toBe(false);
    expect(memory.matches({ type: 'context' })).toBe(true);
  });
});

// =============================================================================
// SwarmCoordinator Tests
// =============================================================================

describe('SwarmCoordinator', () => {
  let coordinator: SwarmCoordinator;

  beforeEach(async () => {
    coordinator = new SwarmCoordinator({ topology: 'hierarchical' });
    await coordinator.initialize();
  });

  afterEach(async () => {
    await coordinator.shutdown();
  });

  it('should spawn and list agents', async () => {
    await coordinator.spawnAgent({ id: 'coder-1', type: 'coder', capabilities: ['code'] });
    await coordinator.spawnAgent({ id: 'tester-1', type: 'tester', capabilities: ['test'] });

    const agents = await coordinator.listAgents();
    expect(agents).toHaveLength(2);
  });

  it('should terminate agents', async () => {
    await coordinator.spawnAgent({ id: 'coder-1', type: 'coder' });
    await coordinator.terminateAgent('coder-1');

    const agents = await coordinator.listAgents();
    expect(agents).toHaveLength(0);
  });

  it('should distribute tasks with load balancing', async () => {
    await coordinator.spawnAgent({ id: 'coder-1', type: 'coder', capabilities: ['code'] });
    await coordinator.spawnAgent({ id: 'coder-2', type: 'coder', capabilities: ['code'] });

    const tasks = [
      { id: 't1', type: 'code', description: 'Task 1', priority: 'high' as const },
      { id: 't2', type: 'code', description: 'Task 2', priority: 'medium' as const }
    ];

    const assignments = await coordinator.distributeTasks(tasks);
    expect(assignments).toHaveLength(2);

    // Both coders should get assigned (load balanced)
    const assignedAgents = new Set(assignments.map(a => a.agentId));
    expect(assignedAgents.size).toBe(2);
  });

  it('should execute tasks on agents', async () => {
    await coordinator.spawnAgent({ id: 'coder-1', type: 'coder', capabilities: ['code'] });

    const result = await coordinator.executeTask('coder-1', {
      id: 'task-1',
      type: 'code',
      description: 'Implement feature',
      priority: 'high'
    });

    expect(result.status).toBe('completed');
    expect(result.agentId).toBe('coder-1');
  });

  it('should track agent metrics', async () => {
    await coordinator.spawnAgent({ id: 'coder-1', type: 'coder', capabilities: ['code'] });

    await coordinator.executeTask('coder-1', {
      id: 't1', type: 'code', description: 'Task', priority: 'high'
    });

    const metrics = await coordinator.getAgentMetrics('coder-1');
    expect(metrics.tasksCompleted).toBe(1);
    expect(metrics.successRate).toBe(1.0);
    expect(metrics.health).toBe('healthy');
  });

  it('should reach consensus', async () => {
    await coordinator.spawnAgent({ id: 'a1', type: 'coder' });
    await coordinator.spawnAgent({ id: 'a2', type: 'coder' });
    await coordinator.spawnAgent({ id: 'a3', type: 'coder' });

    const result = await coordinator.reachConsensus(
      { id: 'd1', type: 'approval', payload: { action: 'deploy' } },
      ['a1', 'a2', 'a3']
    );

    expect(result.votes).toHaveLength(3);
    expect(typeof result.consensusReached).toBe('boolean');
  });

  it('should reconfigure topology', async () => {
    expect(coordinator.getTopology()).toBe('hierarchical');
    await coordinator.reconfigure({ topology: 'mesh' });
    expect(coordinator.getTopology()).toBe('mesh');
  });

  it('should get swarm state', async () => {
    await coordinator.spawnAgent({ id: 'a1', type: 'coder', role: 'leader' });

    const state = await coordinator.getSwarmState();
    expect(state.topology).toBe('hierarchical');
    expect(state.agents).toHaveLength(1);
  });
});

// =============================================================================
// WorkflowEngine Tests
// =============================================================================

describe('WorkflowEngine', () => {
  let coordinator: SwarmCoordinator;
  let engine: WorkflowEngine;

  beforeEach(async () => {
    coordinator = new SwarmCoordinator({ topology: 'mesh' });
    await coordinator.initialize();
    await coordinator.spawnAgent({ id: 'coder-1', type: 'coder', capabilities: ['code', 'design'] });

    engine = new WorkflowEngine({ coordinator });
    await engine.initialize();
  });

  afterEach(async () => {
    await engine.shutdown();
    await coordinator.shutdown();
  });

  it('should execute a simple workflow', async () => {
    const result = await engine.executeWorkflow({
      id: 'wf-1',
      name: 'Test Workflow',
      tasks: [
        { id: 't1', type: 'code', description: 'Step 1', priority: 'high' },
        { id: 't2', type: 'code', description: 'Step 2', priority: 'medium', dependencies: ['t1'] }
      ]
    });

    expect(result.status).toBe('completed');
    expect(result.tasksCompleted).toBe(2);
    expect(result.executionOrder).toEqual(['t1', 't2']);
  });

  it('should handle workflow with rollback', async () => {
    let rolledBack = false;

    const result = await engine.executeWorkflow({
      id: 'wf-2',
      name: 'Rollback Workflow',
      rollbackOnFailure: true,
      tasks: [
        {
          id: 't1',
          type: 'code',
          description: 'Step 1',
          priority: 'high',
          onRollback: async () => { rolledBack = true; }
        },
        {
          id: 't2',
          type: 'code',
          description: 'Step 2 (will fail)',
          priority: 'medium',
          dependencies: ['t1'],
          onExecute: async () => { throw new Error('Intentional failure'); }
        }
      ]
    });

    expect(result.status).toBe('failed');
    expect(rolledBack).toBe(true);
  });

  it('should track workflow state', async () => {
    const promise = engine.startWorkflow({
      id: 'wf-3',
      name: 'State Tracking Workflow',
      tasks: [
        { id: 't1', type: 'code', description: 'Step 1', priority: 'high' }
      ]
    });

    await promise;

    const state = await engine.getWorkflowState('wf-3');
    expect(state.status).toBe('completed');
    expect(state.completedTasks).toContain('t1');
  });
});

// =============================================================================
// Memory Backend Tests
// =============================================================================

describe('SQLiteBackend', () => {
  let backend: SQLiteBackend;

  beforeEach(async () => {
    backend = new SQLiteBackend();
    await backend.initialize();
  });

  afterEach(async () => {
    await backend.close();
  });

  it('should store and retrieve memories', async () => {
    const memory = {
      id: 'mem-1',
      agentId: 'agent-1',
      content: 'Test memory',
      type: 'context' as const,
      timestamp: Date.now()
    };

    await backend.store(memory);
    const retrieved = await backend.retrieve('mem-1');
    expect(retrieved).toBeDefined();
    expect(retrieved!.content).toBe('Test memory');
  });

  it('should query memories by agent', async () => {
    await backend.store({ id: 'm1', agentId: 'a1', content: 'A1 memory', type: 'context', timestamp: Date.now() });
    await backend.store({ id: 'm2', agentId: 'a2', content: 'A2 memory', type: 'context', timestamp: Date.now() });

    const results = await backend.query({ agentId: 'a1' });
    expect(results).toHaveLength(1);
    expect(results[0].agentId).toBe('a1');
  });

  it('should delete memories', async () => {
    await backend.store({ id: 'm1', agentId: 'a1', content: 'Test', type: 'context', timestamp: Date.now() });
    await backend.delete('m1');

    const retrieved = await backend.retrieve('m1');
    expect(retrieved).toBeUndefined();
  });
});

describe('HybridBackend', () => {
  let backend: HybridBackend;

  beforeEach(async () => {
    const sqlite = new SQLiteBackend();
    const agentdb = new AgentDBBackend();
    backend = new HybridBackend(sqlite, agentdb);
    await backend.initialize();
  });

  afterEach(async () => {
    await backend.close();
  });

  it('should store and query memories', async () => {
    await backend.store({
      id: 'mem-1',
      agentId: 'agent-1',
      content: 'Hybrid memory test',
      type: 'context',
      timestamp: Date.now()
    });

    const results = await backend.query({ agentId: 'agent-1' });
    expect(results).toHaveLength(1);
  });

  it('should perform vector search when embeddings exist', async () => {
    await backend.store({
      id: 'mem-1',
      agentId: 'agent-1',
      content: 'Vector memory',
      type: 'context',
      timestamp: Date.now(),
      embedding: [1.0, 0.0, 0.0]
    });

    const results = await backend.vectorSearch([1.0, 0.0, 0.0], 5);
    expect(results.length).toBeGreaterThanOrEqual(1);
  });
});

// =============================================================================
// MCP Server Tests
// =============================================================================

describe('MCPServer', () => {
  let server: MCPServer;
  let coordinator: SwarmCoordinator;

  beforeEach(async () => {
    coordinator = new SwarmCoordinator({ topology: 'mesh' });
    await coordinator.initialize();

    const agentTools = new AgentTools(coordinator);
    server = new MCPServer({ tools: [agentTools] });
    await server.start();
  });

  afterEach(async () => {
    await server.stop();
    await coordinator.shutdown();
  });

  it('should list registered tools', () => {
    const tools = server.listTools();
    expect(tools.length).toBeGreaterThanOrEqual(4);
    expect(tools.map(t => t.name)).toContain('agent_spawn');
  });

  it('should handle spawn agent request', async () => {
    const response = await server.handleRequest({
      id: '1',
      method: 'agent_spawn',
      params: { id: 'test-agent', type: 'coder', capabilities: ['code'] }
    });

    expect(response.result).toBeDefined();
    expect((response.result as any).success).toBe(true);
  });

  it('should handle list agents request', async () => {
    await coordinator.spawnAgent({ id: 'a1', type: 'coder' });

    const response = await server.handleRequest({
      id: '2',
      method: 'agent_list',
      params: {}
    });

    expect(response.result).toBeDefined();
    expect((response.result as any).success).toBe(true);
  });

  it('should return error for unknown method', async () => {
    const response = await server.handleRequest({
      id: '3',
      method: 'unknown_method',
      params: {}
    });

    expect(response.error).toBeDefined();
    expect(response.error!.code).toBe(-32601);
  });
});

// =============================================================================
// Plugin System Tests
// =============================================================================

describe('PluginManager', () => {
  let manager: PluginManager;

  beforeEach(async () => {
    manager = new PluginManager({ coreVersion: '3.0.0' });
    await manager.initialize();
  });

  afterEach(async () => {
    await manager.shutdown();
  });

  it('should load and list plugins', async () => {
    class TestPlugin extends BasePlugin {
      constructor() {
        super({ id: 'test-plugin', name: 'Test Plugin', version: '1.0.0' });
      }
      async initialize() {}
      async shutdown() {}
    }

    const plugin = new TestPlugin();
    await manager.loadPlugin(plugin);

    const plugins = manager.listPlugins();
    expect(plugins).toHaveLength(1);
    expect(plugins[0].id).toBe('test-plugin');
  });

  it('should invoke extension points', async () => {
    let hookCalled = false;

    class HookPlugin extends BasePlugin {
      constructor() {
        super({ id: 'hook-plugin', name: 'Hook Plugin', version: '1.0.0' });
        this.registerExtensionPoint('test.hook', async (ctx) => {
          hookCalled = true;
          return { modified: true };
        });
      }
      async initialize() {}
      async shutdown() {}
    }

    await manager.loadPlugin(new HookPlugin());
    const results = await manager.invokeExtensionPoint('test.hook', { data: 'test' });

    expect(hookCalled).toBe(true);
    expect(results).toHaveLength(1);
  });

  it('should unload plugins', async () => {
    class TestPlugin extends BasePlugin {
      constructor() {
        super({ id: 'removable', name: 'Removable', version: '1.0.0' });
      }
      async initialize() {}
      async shutdown() {}
    }

    await manager.loadPlugin(new TestPlugin());
    expect(manager.listPlugins()).toHaveLength(1);

    await manager.unloadPlugin('removable');
    expect(manager.listPlugins()).toHaveLength(0);
  });
});

// =============================================================================
// ConfigTools Tests
// =============================================================================

describe('ConfigTools', () => {
  let configTools: ConfigTools;

  beforeEach(() => {
    configTools = new ConfigTools();
  });

  it('should validate valid config', async () => {
    const result = await configTools.execute('config_validate', {
      config: {
        swarm: { topology: 'hierarchical' },
        memory: { backend: 'hybrid' }
      }
    });

    expect(result.success).toBe(true);
    expect(result.valid).toBe(true);
  });

  it('should reject invalid topology', async () => {
    const result = await configTools.execute('config_validate', {
      config: {
        swarm: { topology: 'invalid-topology' }
      }
    });

    expect(result.valid).toBe(false);
    expect(result.errors!.length).toBeGreaterThan(0);
  });

  it('should save and load config', async () => {
    await configTools.saveConfig('test.json', {
      swarm: { topology: 'mesh', maxAgents: 5 }
    });

    const config = await configTools.loadConfig('test.json');
    expect(config.swarm?.topology).toBe('mesh');
    expect(config.swarm?.maxAgents).toBe(5);
  });
});
