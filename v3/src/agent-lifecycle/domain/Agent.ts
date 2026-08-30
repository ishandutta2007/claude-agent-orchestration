import type { Agent as IAgent, AgentConfig, AgentStatus, AgentType, AgentRole, Task, TaskResult } from '../../shared/types/index.js';

export class Agent implements IAgent {
  public readonly id: string;
  public readonly type: AgentType;
  public status: AgentStatus;
  public capabilities: string[];
  public role?: AgentRole;
  public parent?: string;
  public metadata?: Record<string, unknown>;
  public createdAt: number;
  public lastActive: number;

  constructor(config: AgentConfig) {
    this.id = config.id;
    this.type = config.type;
    this.status = 'active';
    this.capabilities = config.capabilities || [];
    this.role = config.role;
    this.parent = config.parent;
    this.metadata = config.metadata || {};
    this.createdAt = Date.now();
    this.lastActive = Date.now();
  }

  async executeTask(task: Task): Promise<TaskResult> {
    if (this.status !== 'active' && this.status !== 'idle') {
      return { taskId: task.id, status: 'failed', error: `Agent ${this.id} not available (status: ${this.status})`, agentId: this.id };
    }
    const startTime = Date.now();
    this.status = 'busy';
    this.lastActive = startTime;
    try {
      if (task.onExecute) await task.onExecute();
      await this.processTaskExecution(task);
      const duration = Date.now() - startTime;
      this.status = 'active';
      this.lastActive = Date.now();
      return { taskId: task.id, status: 'completed', result: `Task ${task.id} completed`, duration, agentId: this.id };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.status = 'active';
      return { taskId: task.id, status: 'failed', error: error instanceof Error ? error.message : String(error), duration, agentId: this.id };
    }
  }

  private async processTaskExecution(task: Task): Promise<void> {
    const delays: Record<string, number> = { high: 1, medium: 5, low: 10 };
    await new Promise(resolve => setTimeout(resolve, delays[task.priority] || 5));
  }

  hasCapability(capability: string): boolean { return this.capabilities.includes(capability); }

  canExecute(taskType: string): boolean {
    const map: Record<string, string> = { code: 'code', test: 'test', review: 'review', design: 'design', deploy: 'deploy', refactor: 'refactor', debug: 'debug' };
    const req = map[taskType];
    return req ? this.hasCapability(req) : true;
  }

  terminate(): void { this.status = 'terminated'; this.lastActive = Date.now(); }
  setIdle(): void { if (this.status === 'active' || this.status === 'busy') { this.status = 'idle'; this.lastActive = Date.now(); } }
  activate(): void { if (this.status !== 'terminated') { this.status = 'active'; this.lastActive = Date.now(); } }

  toJSON(): IAgent {
    return { id: this.id, type: this.type, status: this.status, capabilities: this.capabilities, role: this.role, parent: this.parent, metadata: this.metadata, createdAt: this.createdAt, lastActive: this.lastActive };
  }

  static fromConfig(config: AgentConfig): Agent { return new Agent(config); }
}
