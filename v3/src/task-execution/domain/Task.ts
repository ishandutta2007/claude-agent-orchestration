import { Task as ITask, TaskType, TaskPriority, TaskStatus } from '../../shared/types/index.js';

/**
 * Domain entity representing a Task in the claude-flow V3 framework.
 */
export class Task implements ITask {
    public id: string;
    public type: TaskType;
    public description: string;
    public priority: TaskPriority;
    public status: TaskStatus;
    public assignedTo?: string;
    public dependencies: string[];
    public metadata: Record<string, any>;
    public workflow?: string;
    public onExecute?: () => Promise<any>;
    public onRollback?: () => Promise<void>;

    private startTime?: number;
    private endTime?: number;

    constructor(config: ITask) {
        this.id = config.id;
        this.type = config.type;
        this.description = config.description;
        this.priority = config.priority || 'medium';
        this.status = config.status || 'pending';
        this.assignedTo = config.assignedTo;
        this.dependencies = config.dependencies || [];
        this.metadata = config.metadata || {};
        this.workflow = config.workflow;
        this.onExecute = config.onExecute;
        this.onRollback = config.onRollback;
    }

    /**
     * Factory method to create a Task from a configuration object.
     */
    public static fromConfig(config: ITask): Task {
        return new Task(config);
    }

    /**
     * Checks if all dependencies for this task have been resolved.
     */
    public areDependenciesResolved(completedTasks: Set<string>): boolean {
        return this.dependencies.every(depId => completedTasks.has(depId));
    }

    /**
     * Starts the task execution.
     */
    public start(): void {
        if (this.status !== 'pending') {
            throw new Error(`Cannot start task in status: ${this.status}`);
        }
        this.status = 'in_progress';
        this.startTime = Date.now();
    }

    /**
     * Marks the task as completed.
     */
    public complete(): void {
        this.status = 'completed';
        this.endTime = Date.now();
    }

    /**
     * Marks the task as failed, storing the error in metadata.
     */
    public fail(error?: Error): void {
        this.status = 'failed';
        this.endTime = Date.now();
        if (error) {
            this.metadata.error = error.message;
        }
    }

    /**
     * Cancels the task.
     */
    public cancel(): void {
        this.status = 'cancelled';
        this.endTime = Date.now();
    }

    /**
     * Gets the duration of the task if it has started, or completed.
     */
    public getDuration(): number {
        if (!this.startTime) return 0;
        return (this.endTime || Date.now()) - this.startTime;
    }

    /**
     * Checks if this task belongs to a workflow.
     */
    public isWorkflow(): boolean {
        return !!this.workflow;
    }

    /**
     * Assigns the task to an agent.
     */
    public assignTo(agentId: string): void {
        this.assignedTo = agentId;
    }

    /**
     * Gets the numeric value of the task priority (high: 3, medium: 2, low: 1).
     */
    public getPriorityValue(): number {
        switch (this.priority) {
            case 'high': return 3;
            case 'medium': return 2;
            case 'low': return 1;
            default: return 0;
        }
    }

    /**
     * Serializes the task to JSON.
     */
    public toJSON(): Record<string, any> {
        return {
            id: this.id,
            type: this.type,
            description: this.description,
            priority: this.priority,
            status: this.status,
            assignedTo: this.assignedTo,
            dependencies: this.dependencies,
            metadata: this.metadata,
            workflow: this.workflow
        };
    }

    /**
     * Sorts an array of tasks descending by priority.
     */
    public static sortByPriority(tasks: Task[]): Task[] {
        return [...tasks].sort((a, b) => b.getPriorityValue() - a.getPriorityValue());
    }

    /**
     * Resolves the execution order of a set of tasks using a topological sort.
     * Detects circular dependencies.
     */
    public static resolveExecutionOrder(tasks: Task[]): Task[] {
        const result: Task[] = [];
        const visited = new Set<string>();
        const visiting = new Set<string>();
        const taskMap = new Map<string, Task>(tasks.map(t => [t.id, t]));

        function visit(taskId: string) {
            if (visited.has(taskId)) return;
            if (visiting.has(taskId)) {
                throw new Error(`Circular dependency detected involving task: ${taskId}`);
            }

            visiting.add(taskId);
            const task = taskMap.get(taskId);
            if (task) {
                for (const depId of task.dependencies) {
                    if (taskMap.has(depId)) {
                        visit(depId);
                    }
                }
                visiting.delete(taskId);
                visited.add(taskId);
                result.push(task);
            }
        }

        for (const task of tasks) {
            if (!visited.has(task.id)) {
                visit(task.id);
            }
        }

        return result;
    }
}
