import { EventEmitter } from 'events';
import { SwarmCoordinator } from '../../coordination/application/SwarmCoordinator';
import { Task } from '../domain/Task';
import { Workflow, WorkflowState, TaskResult } from '../../../shared/types';

export interface WorkflowEngineOptions {
  coordinator: SwarmCoordinator;
  memoryBackend: any;
  eventBus: EventEmitter;
  pluginManager: any;
}

interface WorkflowExecution {
  id: string;
  state: WorkflowState;
  promise: Promise<TaskResult[]>;
  resolve: (val: any) => void;
  reject: (err: any) => void;
  executionOrder: Task[];
  taskTimings: Record<string, { start?: number, end?: number }>;
  eventLog: any[];
  memorySnapshots: any[];
}

/**
 * Executes and manages workflows.
 */
export class WorkflowEngine {
  private coordinator: SwarmCoordinator;
  private memoryBackend: any;
  private eventBus: EventEmitter;
  private pluginManager: any;
  private workflows: Map<string, WorkflowExecution> = new Map();
  private initialized: boolean = false;

  constructor(options: WorkflowEngineOptions) {
    this.coordinator = options.coordinator;
    this.memoryBackend = options.memoryBackend;
    this.eventBus = options.eventBus;
    this.pluginManager = options.pluginManager;
  }

  public async initialize(): Promise<void> {
    this.initialized = true;
    this.eventBus.emit('engine:initialized');
  }

  public async shutdown(): Promise<void> {
    for (const [id, execution] of this.workflows) {
      if (execution.state === WorkflowState.RUNNING) {
        execution.state = WorkflowState.CANCELLED;
        execution.reject(new Error('Engine shut down'));
      }
    }
    this.workflows.clear();
    this.initialized = false;
    this.eventBus.emit('engine:shutdown');
  }

  public async executeTask(task: Task, agentId: string): Promise<TaskResult> {
    if (this.memoryBackend) {
      await this.memoryBackend.store({
        type: 'task:start',
        taskId: task.id,
        agentId,
        timestamp: Date.now()
      });
    }
    
    const result = await this.coordinator.executeTask(agentId, task);
    
    if (this.memoryBackend) {
      await this.memoryBackend.store({
        type: 'task:complete',
        taskId: task.id,
        agentId,
        result,
        timestamp: Date.now()
      });
    }
    
    return result;
  }

  public async executeWorkflow(workflow: Workflow): Promise<TaskResult[]> {
    const execution = this.createExecution(workflow);
    
    if (this.pluginManager?.invokeHook) {
      await this.pluginManager.invokeHook('workflow.beforeExecute', { workflow });
    }
    
    execution.state = WorkflowState.RUNNING;
    
    try {
      const results = await this.runWorkflow(workflow, execution);
      execution.state = WorkflowState.COMPLETED;
      execution.resolve(results);
      
      if (this.pluginManager?.invokeHook) {
        await this.pluginManager.invokeHook('workflow.afterExecute', { workflow, results });
      }
      
      return results;
    } catch (error) {
      execution.state = WorkflowState.FAILED;
      await this.rollbackWorkflow(workflow, execution);
      execution.reject(error);
      throw error;
    }
  }

  public startWorkflow(workflow: Workflow): Promise<TaskResult[]> {
    const execution = this.createExecution(workflow);
    
    // Start asynchronously without blocking
    Promise.resolve().then(async () => {
      try {
        execution.state = WorkflowState.RUNNING;
        const results = await this.runWorkflow(workflow, execution);
        execution.state = WorkflowState.COMPLETED;
        execution.resolve(results);
      } catch (error) {
        execution.state = WorkflowState.FAILED;
        execution.reject(error);
      }
    });
    
    return execution.promise;
  }

  public async pauseWorkflow(id: string): Promise<void> {
    const execution = this.workflows.get(id);
    if (!execution) throw new Error(`Workflow ${id} not found`);
    if (execution.state === WorkflowState.RUNNING) {
      execution.state = WorkflowState.PAUSED;
    }
  }

  public async resumeWorkflow(id: string): Promise<void> {
    const execution = this.workflows.get(id);
    if (!execution) throw new Error(`Workflow ${id} not found`);
    if (execution.state === WorkflowState.PAUSED) {
      execution.state = WorkflowState.RUNNING;
      // Note: Actual resumption logic would re-trigger runWorkflow loop
    }
  }

  public getWorkflowState(id: string): WorkflowState | undefined {
    return this.workflows.get(id)?.state;
  }

  public async executeParallel(tasks: Task[]): Promise<TaskResult[]> {
    return this.coordinator.executeTasksConcurrently(tasks);
  }

  public async executeDistributedWorkflow(workflow: Workflow, coordinators: SwarmCoordinator[]): Promise<TaskResult[]> {
    const executionOrder = this.coordinator.resolveTaskDependencies(workflow.tasks as Task[]);
    const chunkSize = Math.ceil(executionOrder.length / coordinators.length);
    const promises: Promise<TaskResult[]>[] = [];
    
    for (let i = 0; i < coordinators.length; i++) {
      const chunk = executionOrder.slice(i * chunkSize, (i + 1) * chunkSize);
      if (chunk.length > 0) {
        promises.push(coordinators[i].executeTasksConcurrently(chunk));
      }
    }
    
    const results = await Promise.all(promises);
    return results.flat();
  }

  public getWorkflowMetrics(id: string): any {
    const execution = this.workflows.get(id);
    if (!execution) return null;
    return {
      timings: execution.taskTimings,
      state: execution.state
    };
  }

  public getWorkflowDebugInfo(id: string): any {
    const execution = this.workflows.get(id);
    if (!execution) return null;
    return {
      id: execution.id,
      state: execution.state,
      eventLog: execution.eventLog,
      memorySnapshots: execution.memorySnapshots
    };
  }

  public async restoreWorkflow(id: string): Promise<void> {
    if (!this.memoryBackend) return;
    const snapshot = await this.memoryBackend.retrieve(`workflow:state:${id}`);
    if (snapshot) {
      // Stub for restore logic
    }
  }

  private createExecution(workflow: Workflow): WorkflowExecution {
    let resolveFn: any;
    let rejectFn: any;
    const promise = new Promise<TaskResult[]>((resolve, reject) => {
      resolveFn = resolve;
      rejectFn = reject;
    });

    const executionOrder = this.coordinator.resolveTaskDependencies(workflow.tasks as Task[]);
    
    const execution: WorkflowExecution = {
      id: workflow.id,
      state: WorkflowState.PENDING,
      promise,
      resolve: resolveFn,
      reject: rejectFn,
      executionOrder,
      taskTimings: {},
      eventLog: [],
      memorySnapshots: []
    };
    
    this.workflows.set(workflow.id, execution);
    return execution;
  }

  private async runWorkflow(workflow: Workflow, execution: WorkflowExecution): Promise<TaskResult[]> {
    const results: TaskResult[] = [];
    const assignments = await this.coordinator.distributeTasks(execution.executionOrder);
    
    for (const task of execution.executionOrder) {
      if (execution.state === WorkflowState.PAUSED) {
        await new Promise(r => {
          const interval = setInterval(() => {
            if (execution.state === WorkflowState.RUNNING) {
              clearInterval(interval);
              r(null);
            } else if (execution.state === WorkflowState.CANCELLED) {
              clearInterval(interval);
              throw new Error('Workflow cancelled');
            }
          }, 100);
        });
      }
      if (execution.state === WorkflowState.CANCELLED) {
        throw new Error('Workflow cancelled');
      }

      let assignedAgentId = '';
      for (const [agentId, agentTasks] of assignments) {
        if (agentTasks.some(t => t.id === task.id)) {
          assignedAgentId = agentId;
          break;
        }
      }

      if (!assignedAgentId) {
        throw new Error(`No agent assigned for task ${task.id}`);
      }

      execution.taskTimings[task.id] = { start: Date.now() };
      const result = await this.executeTask(task, assignedAgentId);
      execution.taskTimings[task.id].end = Date.now();
      
      results.push(result);
    }
    
    return results;
  }

  private async rollbackWorkflow(workflow: Workflow, execution: WorkflowExecution): Promise<void> {
    execution.eventLog.push({ type: 'rollback', timestamp: Date.now() });
    // Implementation of compensating transactions would go here
  }
}
