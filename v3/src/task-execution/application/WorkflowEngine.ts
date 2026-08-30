/**
 * WorkflowEngine
 *
 * Executes and manages workflows with dependency resolution, rollback, and state tracking.
 */

import { EventEmitter } from 'events';
import { Task } from '../domain/Task.js';
import type { SwarmCoordinator } from '../../coordination/application/SwarmCoordinator.js';
import type {
  MemoryBackend,
  PluginManagerInterface,
  Task as ITask,
  TaskResult,
  WorkflowDefinition,
  WorkflowResult,
  WorkflowState,
  WorkflowStatus
} from '../../shared/types/index.js';

export interface WorkflowEngineOptions {
  coordinator: SwarmCoordinator;
  memoryBackend?: MemoryBackend;
  eventBus?: EventEmitter;
  pluginManager?: PluginManagerInterface;
}

interface WorkflowExecution {
  id: string;
  state: WorkflowState;
  results: Map<string, TaskResult>;
  executionOrder: string[];
  promise?: Promise<WorkflowResult>;
  resolve?: (result: WorkflowResult) => void;
  reject?: (error: Error) => void;
}

export class WorkflowEngine {
  private coordinator: SwarmCoordinator;
  private memoryBackend?: MemoryBackend;
  private eventBus: EventEmitter;
  private pluginManager?: PluginManagerInterface;
  private workflows: Map<string, WorkflowExecution> = new Map();
  private initialized: boolean = false;

  constructor(options: WorkflowEngineOptions) {
    this.coordinator = options.coordinator;
    this.memoryBackend = options.memoryBackend;
    this.eventBus = options.eventBus || new EventEmitter();
    this.pluginManager = options.pluginManager;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
  }

  async shutdown(): Promise<void> {
    for (const [id, exec] of this.workflows.entries()) {
      if (exec.state.status === 'in-progress') {
        exec.state.status = 'cancelled' as WorkflowStatus;
      }
    }
    this.workflows.clear();
    this.initialized = false;
  }

  async executeWorkflow(workflow: WorkflowDefinition): Promise<WorkflowResult> {
    const exec = this.createExecution(workflow);
    this.workflows.set(workflow.id, exec);

    // Plugin hook
    if (this.pluginManager) {
      try { await this.pluginManager.invokeExtensionPoint('workflow.beforeExecute', { workflow }); } catch {}
    }

    exec.state.status = 'in-progress';
    exec.state.startedAt = Date.now();
    this.eventBus.emit('workflow:started', { workflowId: workflow.id });

    try {
      const result = await this.runWorkflow(exec, workflow);
      if (this.pluginManager) {
        try { await this.pluginManager.invokeExtensionPoint('workflow.afterExecute', { workflow, result }); } catch {}
      }
      return result;
    } catch (error) {
      exec.state.status = 'failed';
      return {
        id: workflow.id, status: 'failed', tasksCompleted: exec.executionOrder.length,
        errors: [error instanceof Error ? error : new Error(String(error))],
        executionOrder: exec.executionOrder
      };
    }
  }

  async startWorkflow(workflow: WorkflowDefinition): Promise<WorkflowResult> {
    return this.executeWorkflow(workflow);
  }

  async pauseWorkflow(workflowId: string): Promise<void> {
    const exec = this.workflows.get(workflowId);
    if (exec && exec.state.status === 'in-progress') {
      exec.state.status = 'paused';
    }
  }

  async resumeWorkflow(workflowId: string): Promise<void> {
    const exec = this.workflows.get(workflowId);
    if (exec && exec.state.status === 'paused') {
      exec.state.status = 'in-progress';
    }
  }

  async getWorkflowState(workflowId: string): Promise<WorkflowState> {
    const exec = this.workflows.get(workflowId);
    if (!exec) return { id: workflowId, name: '', tasks: [], status: 'pending' as WorkflowStatus, completedTasks: [] };
    return { ...exec.state };
  }

  async executeParallel(tasks: ITask[]): Promise<TaskResult[]> {
    return this.coordinator.executeTasksConcurrently(tasks);
  }

  async executeDistributedWorkflow(workflow: WorkflowDefinition, coordinators: SwarmCoordinator[]): Promise<WorkflowResult> {
    // Basic: just use the primary coordinator
    return this.executeWorkflow(workflow);
  }

  private createExecution(workflow: WorkflowDefinition): WorkflowExecution {
    return {
      id: workflow.id,
      state: {
        id: workflow.id, name: workflow.name, tasks: workflow.tasks,
        status: 'pending', completedTasks: []
      },
      results: new Map(),
      executionOrder: []
    };
  }

  private async runWorkflow(exec: WorkflowExecution, workflow: WorkflowDefinition): Promise<WorkflowResult> {
    const tasks = workflow.tasks.map(t => new Task(t));
    const ordered = Task.resolveExecutionOrder(tasks);
    const completedTasks = new Set<string>();
    const errors: Error[] = [];

    // Get available agents
    const agents = await this.coordinator.listAgents();

    for (const task of ordered) {
      // Check paused/cancelled
      if (exec.state.status === 'paused' || exec.state.status === 'cancelled') break;

      exec.state.currentTask = task.id;

      // Find a suitable agent or use the first one
      let agentId = agents.length > 0 ? agents[0].id : undefined;
      for (const agent of agents) {
        if (agent.canExecute(task.type) && agent.status === 'active') {
          agentId = agent.id;
          break;
        }
      }

      if (!agentId) {
        if (workflow.rollbackOnFailure) {
          await this.rollbackWorkflow(exec, ordered, completedTasks);
        }
        return {
          id: workflow.id, status: 'failed',
          tasksCompleted: completedTasks.size,
          errors: [new Error(`No agent available for task ${task.id}`)],
          executionOrder: exec.executionOrder
        };
      }

      const result = await this.coordinator.executeTask(agentId, task);
      exec.results.set(task.id, result);

      if (result.status === 'completed') {
        completedTasks.add(task.id);
        exec.executionOrder.push(task.id);
        exec.state.completedTasks.push(task.id);
      } else {
        errors.push(new Error(result.error || `Task ${task.id} failed`));
        if (workflow.rollbackOnFailure) {
          await this.rollbackWorkflow(exec, ordered, completedTasks);
        }
        exec.state.status = 'failed';
        exec.state.completedAt = Date.now();
        return {
          id: workflow.id, status: 'failed',
          tasksCompleted: completedTasks.size, errors,
          executionOrder: exec.executionOrder,
          duration: Date.now() - (exec.state.startedAt || Date.now())
        };
      }
    }

    exec.state.status = 'completed';
    exec.state.completedAt = Date.now();
    return {
      id: workflow.id, status: 'completed',
      tasksCompleted: completedTasks.size, errors: [],
      executionOrder: exec.executionOrder,
      duration: Date.now() - (exec.state.startedAt || Date.now())
    };
  }

  private async rollbackWorkflow(exec: WorkflowExecution, tasks: Task[], completed: Set<string>): Promise<void> {
    // Rollback completed tasks in reverse order
    const completedTasks = tasks.filter(t => completed.has(t.id)).reverse();
    for (const task of completedTasks) {
      try {
        if (task.onRollback) await task.onRollback();
      } catch { /* rollback errors are swallowed */ }
    }
    this.eventBus.emit('workflow:rollback', { workflowId: exec.id });
  }
}
