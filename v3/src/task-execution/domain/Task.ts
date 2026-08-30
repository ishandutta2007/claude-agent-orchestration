import type { Task as ITask, TaskStatus, TaskPriority, TaskType, TaskResult } from '../../shared/types/index.js';

export class Task implements ITask {
  public id: string;
  public type: TaskType;
  public priority: TaskPriority;
  public status: TaskStatus;
  public input: any;
  public workflowId?: string;
  public parentId?: string;
  public agentId?: string;
  public result?: any;
  public error?: string;
  public dependencies: string[];
  public metadata?: Record<string, unknown>;
  public onExecute?: () => Promise<void>;
  public startTime?: number;
  public endTime?: number;

  constructor(config: ITask) {
    this.id = config.id;
    this.type = config.type;
    this.priority = config.priority;
    this.status = config.status || 'pending';
    this.input = config.input;
    this.workflowId = config.workflowId;
    this.parentId = config.parentId;
    this.agentId = config.agentId;
    this.dependencies = config.dependencies || [];
    this.metadata = config.metadata || {};
    this.onExecute = config.onExecute;
  }

  areDependenciesResolved(completedTasks: Set<string>): boolean {
    return this.dependencies.every(dep => completedTasks.has(dep));
  }

  start(): void {
    if (this.status !== 'pending' && this.status !== 'cancelled') {
      throw new Error(`Cannot start task in status ${this.status}`);
    }
    this.status = 'in-progress';
    this.startTime = Date.now();
  }

  complete(result?: any): void {
    if (this.status !== 'in-progress') {
      throw new Error(`Cannot complete task in status ${this.status}`);
    }
    this.status = 'completed';
    this.result = result;
    this.endTime = Date.now();
  }

  fail(error?: string): void {
    this.status = 'failed';
    this.error = error;
    this.endTime = Date.now();
  }

  cancel(): void {
    this.status = 'cancelled';
    this.endTime = Date.now();
  }

  getDuration(): number {
    if (!this.startTime) return 0;
    return (this.endTime || Date.now()) - this.startTime;
  }

  isWorkflow(): boolean {
    return this.type === 'workflow';
  }

  assignTo(agentId: string): void {
    this.agentId = agentId;
  }

  getPriorityValue(): number {
    const map: Record<string, number> = { high: 3, medium: 2, low: 1 };
    return map[this.priority] || 1;
  }

  toJSON(): ITask {
    return {
      id: this.id,
      type: this.type,
      priority: this.priority,
      status: this.status,
      input: this.input,
      workflowId: this.workflowId,
      parentId: this.parentId,
      agentId: this.agentId,
      result: this.result,
      error: this.error,
      dependencies: this.dependencies,
      metadata: this.metadata
    };
  }

  static fromConfig(config: ITask): Task {
    return new Task(config);
  }

  static sortByPriority(tasks: Task[]): Task[] {
    return [...tasks].sort((a, b) => b.getPriorityValue() - a.getPriorityValue());
  }

  static resolveExecutionOrder(tasks: Task[]): Task[] {
    const order: Task[] = [];
    const visited = new Set<string>();
    const processing = new Set<string>();
    const taskMap = new Map(tasks.map(t => [t.id, t]));

    const visit = (taskId: string) => {
      if (processing.has(taskId)) throw new Error(`Circular dependency detected involving task ${taskId}`);
      if (visited.has(taskId)) return;

      processing.add(taskId);
      const task = taskMap.get(taskId);
      if (task) {
        for (const dep of task.dependencies) {
          if (taskMap.has(dep)) {
            visit(dep);
          }
        }
        order.push(task);
      }
      processing.delete(taskId);
      visited.add(taskId);
    };

    for (const task of tasks) {
      visit(task.id);
    }

    return order;
  }
}
