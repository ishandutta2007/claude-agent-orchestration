import { EventEmitter } from 'events';
import { 
  SwarmConfig, 
  TopologyType, 
  AgentMessage, 
  TaskResult,
  AgentConfig,
  AgentStatus,
  TaskState,
  ConsensusDecision,
  AgentMetrics,
  SwarmState
} from '../../../shared/types';
import { Agent, AgentType } from '../../agent/domain/Agent';
import { Task } from '../../task-execution/domain/Task';

export interface SwarmCoordinatorOptions extends SwarmConfig {
  topology: TopologyType;
  memoryBackend: any;
  eventBus: EventEmitter;
  pluginManager: any;
}

/**
 * Coordinates multi-agent swarms.
 */
export class SwarmCoordinator {
  private topology: TopologyType;
  private agents: Map<string, Agent> = new Map();
  private memoryBackend: any;
  private eventBus: EventEmitter;
  private pluginManager: any;
  private agentMetrics: Map<string, AgentMetrics> = new Map();
  private connections: Array<{source: string, target: string, type: string}> = [];
  private initialized: boolean = false;

  constructor(options: SwarmCoordinatorOptions) {
    this.topology = options.topology;
    this.memoryBackend = options.memoryBackend;
    this.eventBus = options.eventBus;
    this.pluginManager = options.pluginManager;
  }

  /**
   * Initializes the coordinator.
   */
  public async initialize(): Promise<void> {
    this.initialized = true;
    this.eventBus.emit('swarm:initialized');
  }

  /**
   * Terminates all agents and clears state.
   */
  public async shutdown(): Promise<void> {
    for (const [id] of this.agents) {
      await this.terminateAgent(id);
    }
    this.agents.clear();
    this.agentMetrics.clear();
    this.connections = [];
    this.initialized = false;
    this.eventBus.emit('swarm:shutdown');
  }

  /**
   * Creates an Agent, initializes metrics, updates connections, emits event.
   */
  public async spawnAgent(config: AgentConfig): Promise<Agent> {
    const agent = new Agent({
      ...config,
      capabilities: config.capabilities || this.getDefaultCapabilities(config.type)
    });
    
    this.agents.set(agent.id, agent);
    
    this.agentMetrics.set(agent.id, {
      tasksCompleted: 0,
      tasksFailed: 0,
      averageExecutionTime: 0,
      successRate: 1,
      totalExecutionTime: 0
    });
    
    this.updateConnections(agent);
    
    if (this.memoryBackend) {
      await this.memoryBackend.store({
        type: 'agent:spawn',
        agentId: agent.id,
        timestamp: Date.now()
      });
    }
    
    this.eventBus.emit('agent:spawned', { agentId: agent.id });
    return agent;
  }

  /**
   * Lists all active agents.
   */
  public listAgents(): Agent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Terminates a specific agent by ID.
   */
  public async terminateAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);
    
    agent.terminate();
    this.agents.delete(agentId);
    this.agentMetrics.delete(agentId);
    this.connections = this.connections.filter(c => c.source !== agentId && c.target !== agentId);
    
    this.eventBus.emit('agent:terminated', { agentId });
  }

  /**
   * Distributes tasks to available agents based on capability and load.
   */
  public async distributeTasks(tasks: Task[]): Promise<Map<string, Task[]>> {
    const assignments = new Map<string, Task[]>();
    
    const sortedTasks = [...tasks].sort((a, b) => b.priority - a.priority);
    
    for (const task of sortedTasks) {
      const candidates = this.listAgents().filter(a => 
        a.status === AgentStatus.IDLE && a.canExecute(task)
      );
      
      if (candidates.length === 0) {
        throw new Error(`No available agent capable of executing task ${task.id}`);
      }
      
      const lowestLoad = candidates.reduce((prev, curr) => {
        const prevAssigned = assignments.get(prev.id)?.length || 0;
        const currAssigned = assignments.get(curr.id)?.length || 0;
        return prevAssigned <= currAssigned ? prev : curr;
      });
      
      const agentTasks = assignments.get(lowestLoad.id) || [];
      agentTasks.push(task);
      assignments.set(lowestLoad.id, agentTasks);
    }
    
    return assignments;
  }

  /**
   * Executes a single task on a specific agent.
   */
  public async executeTask(agentId: string, task: Task): Promise<TaskResult> {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);
    
    const startTime = Date.now();
    try {
      agent.assignTask(task);
      const result = await agent.executeTask(task.id);
      
      const executionTime = Date.now() - startTime;
      this.updateMetrics(agentId, true, executionTime);
      
      if (this.memoryBackend) {
        await this.memoryBackend.store({
          type: 'task:result',
          taskId: task.id,
          agentId,
          result,
          timestamp: Date.now()
        });
      }
      
      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.updateMetrics(agentId, false, executionTime);
      throw error;
    }
  }

  /**
   * Distributes and executes tasks concurrently.
   */
  public async executeTasksConcurrently(tasks: Task[]): Promise<TaskResult[]> {
    const assignments = await this.distributeTasks(tasks);
    const promises: Promise<TaskResult>[] = [];
    
    for (const [agentId, agentTasks] of assignments) {
      for (const task of agentTasks) {
        promises.push(this.executeTask(agentId, task));
      }
    }
    
    return Promise.all(promises);
  }

  /**
   * Sends a message to an agent or the swarm.
   */
  public async sendMessage(message: AgentMessage): Promise<void> {
    this.eventBus.emit('agent:message', message);
  }

  /**
   * Gets the state of the swarm.
   */
  public getSwarmState(): SwarmState {
    return {
      agents: this.listAgents().map(a => a.getState()),
      connections: [...this.connections]
    } as unknown as SwarmState; // Casting as shared types may slightly differ in SwarmState
  }

  public getTopology(): TopologyType {
    return this.topology;
  }

  public getHierarchy(): any {
    if (this.topology !== TopologyType.HIERARCHICAL) return null;
    const leader = this.getLeader();
    return {
      leader: leader?.id,
      workers: this.listAgents().filter(a => a.id !== leader?.id).map(a => a.id)
    };
  }

  public getMeshConnections(): any[] {
    if (this.topology !== TopologyType.MESH) return [];
    return this.connections.filter(c => c.type === 'peer');
  }

  /**
   * Scales the swarm by spawning or terminating agents.
   */
  public async scaleAgents(options: { type: AgentType, count: number }): Promise<void> {
    const currentOfType = this.listAgents().filter(a => a.type === options.type);
    
    if (currentOfType.length < options.count) {
      const toSpawn = options.count - currentOfType.length;
      for (let i = 0; i < toSpawn; i++) {
        await this.spawnAgent({
          id: `${options.type}-${Date.now()}-${i}`,
          name: `Scaled-${options.type}-${i}`,
          type: options.type,
          role: 'worker'
        });
      }
    } else if (currentOfType.length > options.count) {
      const toTerminate = currentOfType.slice(options.count);
      for (const agent of toTerminate) {
        await this.terminateAgent(agent.id);
      }
    }
  }

  /**
   * Collects votes from agents to reach consensus.
   */
  public async reachConsensus(decision: ConsensusDecision, agentIds: string[]): Promise<boolean> {
    if (agentIds.length === 0) return false;
    // Basic stub for consensus logic
    return true; 
  }

  /**
   * Resolves execution order of dependent tasks.
   */
  public resolveTaskDependencies(tasks: Task[]): Task[] {
    return Task.resolveExecutionOrder(tasks);
  }

  public getAgentMetrics(agentId: string): AgentMetrics | undefined {
    return this.agentMetrics.get(agentId);
  }

  public async reconfigure(options: { topology: TopologyType }): Promise<void> {
    this.topology = options.topology;
    this.connections = [];
    for (const agent of this.listAgents()) {
      this.updateConnections(agent);
    }
  }

  private getLeader(): Agent | undefined {
    return this.listAgents().find(a => a.type === AgentType.ORCHESTRATOR);
  }

  private updateConnections(newAgent: Agent): void {
    if (this.topology === TopologyType.MESH) {
      for (const agent of this.agents.values()) {
        if (agent.id !== newAgent.id) {
          this.connections.push({ source: newAgent.id, target: agent.id, type: 'peer' });
          this.connections.push({ source: agent.id, target: newAgent.id, type: 'peer' });
        }
      }
    } else if (this.topology === TopologyType.HIERARCHICAL) {
      const leader = this.getLeader();
      if (leader && newAgent.id !== leader.id) {
        this.connections.push({ source: leader.id, target: newAgent.id, type: 'subordinate' });
        this.connections.push({ source: newAgent.id, target: leader.id, type: 'manager' });
      } else if (newAgent.id === leader?.id) {
        for (const agent of this.agents.values()) {
          if (agent.id !== newAgent.id) {
            this.connections.push({ source: newAgent.id, target: agent.id, type: 'subordinate' });
            this.connections.push({ source: agent.id, target: newAgent.id, type: 'manager' });
          }
        }
      }
    }
  }

  private updateMetrics(agentId: string, success: boolean, executionTime: number): void {
    const metrics = this.agentMetrics.get(agentId);
    if (!metrics) return;
    
    if (success) {
      metrics.tasksCompleted++;
    } else {
      metrics.tasksFailed++;
    }
    
    metrics.totalExecutionTime += executionTime;
    const totalTasks = metrics.tasksCompleted + metrics.tasksFailed;
    metrics.averageExecutionTime = metrics.totalExecutionTime / totalTasks;
    metrics.successRate = metrics.tasksCompleted / totalTasks;
  }

  private getDefaultCapabilities(type: AgentType): string[] {
    switch (type) {
      case AgentType.EXECUTOR: return ['execute', 'write', 'read'];
      case AgentType.RESEARCHER: return ['search', 'read', 'analyze'];
      case AgentType.ORCHESTRATOR: return ['plan', 'manage', 'delegate'];
      case AgentType.CRITIC: return ['evaluate', 'review', 'verify'];
      default: return [];
    }
  }
}
