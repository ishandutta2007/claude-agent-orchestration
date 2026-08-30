/**
 * SwarmCoordinator
 *
 * Coordinates multi-agent swarms with support for hierarchical and mesh topologies.
 */

import { EventEmitter } from 'events';
import { Agent } from '../../agent-lifecycle/domain/Agent.js';
import { Task } from '../../task-execution/domain/Task.js';
import type {
  AgentConfig,
  AgentMessage,
  AgentMetrics,
  ConsensusDecision,
  ConsensusResult,
  MeshConnection,
  MemoryBackend,
  PluginManagerInterface,
  SwarmConfig,
  SwarmHierarchy,
  SwarmState,
  SwarmTopology,
  Task as ITask,
  TaskAssignment,
  TaskResult
} from '../../shared/types/index.js';

export interface SwarmCoordinatorOptions extends SwarmConfig {
  topology: SwarmTopology;
  memoryBackend?: MemoryBackend;
  eventBus?: EventEmitter;
  pluginManager?: PluginManagerInterface;
}

export class SwarmCoordinator {
  private topology: SwarmTopology;
  private agents: Map<string, Agent>;
  private memoryBackend?: MemoryBackend;
  private eventBus: EventEmitter;
  private pluginManager?: PluginManagerInterface;
  private agentMetrics: Map<string, AgentMetrics>;
  private connections: MeshConnection[];
  private initialized: boolean = false;

  constructor(options: SwarmCoordinatorOptions) {
    this.topology = options.topology;
    this.memoryBackend = options.memoryBackend;
    this.eventBus = options.eventBus || new EventEmitter();
    this.pluginManager = options.pluginManager;
    this.agents = new Map();
    this.agentMetrics = new Map();
    this.connections = [];
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
  }

  async shutdown(): Promise<void> {
    for (const agent of this.agents.values()) {
      agent.terminate();
    }
    this.agents.clear();
    this.connections = [];
    this.agentMetrics.clear();
    this.initialized = false;
  }

  async spawnAgent(config: AgentConfig): Promise<Agent> {
    const agent = new Agent(config);
    this.agents.set(agent.id, agent);
    this.agentMetrics.set(agent.id, {
      agentId: agent.id, tasksCompleted: 0, tasksFailed: 0,
      averageExecutionTime: 0, successRate: 1.0, health: 'healthy'
    });
    this.updateConnections(agent);
    this.eventBus.emit('agent:spawned', { agentId: agent.id, type: agent.type });
    if (this.memoryBackend) {
      await this.memoryBackend.store({
        id: `agent-spawn-${agent.id}`, agentId: 'system',
        content: `Agent ${agent.id} spawned`, type: 'event',
        timestamp: Date.now(), metadata: { eventType: 'agent-spawn', agentId: agent.id }
      });
    }
    return agent;
  }

  async listAgents(): Promise<Agent[]> {
    return Array.from(this.agents.values());
  }

  async terminateAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.terminate();
      this.agents.delete(agentId);
      this.agentMetrics.delete(agentId);
      this.connections = this.connections.filter(c => c.from !== agentId && c.to !== agentId);
      this.eventBus.emit('agent:terminated', { agentId });
    }
  }

  async distributeTasks(tasks: ITask[]): Promise<TaskAssignment[]> {
    const assignments: TaskAssignment[] = [];
    const agentLoads = new Map<string, number>();
    for (const agent of this.agents.values()) agentLoads.set(agent.id, 0);

    const sortedTasks = Task.sortByPriority(tasks.map(t => new Task(t)));
    for (const task of sortedTasks) {
      const suitableAgents = Array.from(this.agents.values()).filter(
        agent => agent.canExecute(task.type) && agent.status === 'active'
      );
      if (suitableAgents.length === 0) continue;

      let bestAgent = suitableAgents[0];
      let lowestLoad = agentLoads.get(bestAgent.id) || 0;
      for (const agent of suitableAgents) {
        const load = agentLoads.get(agent.id) || 0;
        if (load < lowestLoad) { lowestLoad = load; bestAgent = agent; }
      }
      assignments.push({ taskId: task.id, agentId: bestAgent.id, assignedAt: Date.now(), priority: task.priority });
      agentLoads.set(bestAgent.id, (agentLoads.get(bestAgent.id) || 0) + 1);
    }
    return assignments;
  }

  async executeTask(agentId: string, task: ITask): Promise<TaskResult> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return { taskId: task.id, status: 'failed', error: `Agent ${agentId} not found`, agentId };
    }
    const startTime = Date.now();
    const result = await agent.executeTask(task);
    const duration = Date.now() - startTime;

    const metrics = this.agentMetrics.get(agentId);
    if (metrics) {
      if (result.status === 'completed') metrics.tasksCompleted++;
      else metrics.tasksFailed = (metrics.tasksFailed || 0) + 1;
      const total = metrics.tasksCompleted + (metrics.tasksFailed || 0);
      metrics.successRate = metrics.tasksCompleted / total;
      metrics.averageExecutionTime = (metrics.averageExecutionTime * (total - 1) + duration) / total;
    }
    return result;
  }

  async executeTasksConcurrently(tasks: ITask[]): Promise<TaskResult[]> {
    const assignments = await this.distributeTasks(tasks);
    return Promise.all(assignments.map(async a => {
      const task = tasks.find(t => t.id === a.taskId);
      if (!task) return { taskId: a.taskId, status: 'failed' as const, error: 'Task not found' };
      return this.executeTask(a.agentId, task);
    }));
  }

  async sendMessage(message: AgentMessage): Promise<void> {
    this.eventBus.emit('agent:message', { ...message, timestamp: Date.now() });
  }

  async getSwarmState(): Promise<SwarmState> {
    return {
      agents: Array.from(this.agents.values()),
      topology: this.topology,
      leader: this.getLeader()?.id,
      activeConnections: this.connections.length
    };
  }

  getTopology(): SwarmTopology { return this.topology; }

  async getHierarchy(): Promise<SwarmHierarchy> {
    const leader = this.getLeader();
    return {
      leader: leader?.id || '',
      workers: Array.from(this.agents.values())
        .filter(a => a.role !== 'leader')
        .map(a => ({ id: a.id, parent: a.parent || leader?.id || '' }))
    };
  }

  async getMeshConnections(): Promise<MeshConnection[]> { return this.connections; }

  async scaleAgents(config: { type: string; count: number }): Promise<void> {
    const existing = Array.from(this.agents.values()).filter(a => a.type === config.type);
    if (config.count > 0) {
      for (let i = 0; i < config.count; i++) {
        await this.spawnAgent({ id: `${config.type}-${Date.now()}-${i}`, type: config.type, capabilities: this.getDefaultCapabilities(config.type) });
      }
    } else if (config.count < 0) {
      for (const agent of existing.slice(0, Math.abs(config.count))) {
        await this.terminateAgent(agent.id);
      }
    }
  }

  async reachConsensus(decision: ConsensusDecision, agentIds: string[]): Promise<ConsensusResult> {
    const votes: Array<{ agentId: string; vote: unknown }> = [];
    for (const agentId of agentIds) {
      if (this.agents.has(agentId)) {
        votes.push({ agentId, vote: Math.random() > 0.5 ? 'approve' : 'reject' });
      }
    }
    const approves = votes.filter(v => v.vote === 'approve').length;
    const consensusReached = approves > votes.length / 2;
    return { decision: consensusReached ? decision.payload : null, votes, consensusReached };
  }

  async resolveTaskDependencies(tasks: ITask[]): Promise<ITask[]> {
    return Task.resolveExecutionOrder(tasks.map(t => new Task(t)));
  }

  async getAgentMetrics(agentId: string): Promise<AgentMetrics> {
    return this.agentMetrics.get(agentId) || {
      agentId, tasksCompleted: 0, averageExecutionTime: 0, successRate: 0, health: 'unhealthy'
    };
  }

  async reconfigure(config: { topology: SwarmTopology }): Promise<void> {
    this.topology = config.topology;
    this.connections = [];
    for (const agent of this.agents.values()) this.updateConnections(agent);
  }

  private getLeader(): Agent | undefined {
    return Array.from(this.agents.values()).find(a => a.role === 'leader');
  }

  private updateConnections(agent: Agent): void {
    if (this.topology === 'mesh') {
      for (const other of this.agents.values()) {
        if (other.id !== agent.id) {
          this.connections.push({ from: agent.id, to: other.id, type: 'peer' });
        }
      }
    } else if (this.topology === 'hierarchical') {
      const leader = this.getLeader();
      if (leader && agent.role !== 'leader') {
        this.connections.push({ from: agent.id, to: leader.id, type: 'leader' });
      }
    }
  }

  private getDefaultCapabilities(type: string): string[] {
    const defaults: Record<string, string[]> = {
      coder: ['code', 'refactor', 'debug'], tester: ['test', 'validate'],
      reviewer: ['review', 'analyze'], coordinator: ['coordinate', 'manage'],
      designer: ['design', 'prototype'], deployer: ['deploy', 'release']
    };
    return defaults[type] || [];
  }
}
