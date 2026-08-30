import { Agent as IAgent, AgentConfig, AgentStatus, AgentRole, AgentType, AgentCapability, Task, TaskResult } from '../../shared/types/index.js';

/**
 * Domain entity representing an Agent in the claude-flow V3 framework.
 */
export class Agent implements IAgent {
    public readonly id: string;
    public readonly type: AgentType;
    public status: AgentStatus;
    public capabilities: AgentCapability[];
    public role: AgentRole;
    public parent?: string;
    public metadata: Record<string, any>;
    public readonly createdAt: Date;
    public lastActive: Date;

    constructor(config: AgentConfig) {
        this.id = config.id;
        this.type = config.type;
        this.capabilities = config.capabilities || [];
        this.role = config.role || 'worker';
        this.parent = config.parent;
        this.metadata = config.metadata || {};
        this.status = 'active';
        this.createdAt = new Date();
        this.lastActive = new Date();
    }

    /**
     * Factory method to create an Agent from an AgentConfig
     */
    public static fromConfig(config: AgentConfig): Agent {
        return new Agent(config);
    }

    /**
     * Executes a given task, managing agent state transitions.
     */
    public async executeTask(task: Task): Promise<TaskResult> {
        this.status = 'busy';
        this.lastActive = new Date();
        const startTime = Date.now();
        let result: any;
        let error: Error | undefined;
        let status: 'success' | 'failure' = 'success';

        try {
            await this.processTaskExecution(task);
            if (task.onExecute) {
                result = await task.onExecute();
            } else {
                result = `Task ${task.id} executed successfully.`;
            }
        } catch (err: any) {
            status = 'failure';
            error = err instanceof Error ? err : new Error(String(err));
        } finally {
            this.status = 'active';
            this.lastActive = new Date();
        }

        return {
            taskId: task.id,
            status,
            result,
            error,
            duration: Date.now() - startTime,
            agentId: this.id
        };
    }

    /**
     * Simulates minimal overhead delay based on task priority.
     */
    private async processTaskExecution(task: Task): Promise<void> {
        let delayMs = 10;
        if (task.priority === 'high') delayMs = 1;
        else if (task.priority === 'medium') delayMs = 5;

        return new Promise(resolve => setTimeout(resolve, delayMs));
    }

    /**
     * Checks if the agent possesses a specific capability.
     */
    public hasCapability(capabilityName: string): boolean {
        return this.capabilities.some(c => c.name === capabilityName);
    }

    /**
     * Determines if the agent can execute a specific task type based on its capabilities.
     * Maps task types to general capability names.
     */
    public canExecute(taskType: string): boolean {
        // A simple mapping heuristic for demonstration purposes
        const requiredCapability = `${taskType}_execution`;
        return this.hasCapability(requiredCapability) || this.hasCapability('general_execution');
    }

    /**
     * Terminates the agent, transitioning it to a terminated state.
     */
    public terminate(): void {
        this.status = 'terminated';
        this.lastActive = new Date();
    }

    /**
     * Sets the agent to idle state.
     */
    public setIdle(): void {
        if (this.status !== 'terminated' && this.status !== 'error') {
            this.status = 'idle';
            this.lastActive = new Date();
        }
    }

    /**
     * Activates the agent, transitioning it to an active state.
     */
    public activate(): void {
        if (this.status !== 'terminated' && this.status !== 'error') {
            this.status = 'active';
            this.lastActive = new Date();
        }
    }

    /**
     * Serializes the agent to JSON.
     */
    public toJSON(): Record<string, any> {
        return {
            id: this.id,
            type: this.type,
            status: this.status,
            capabilities: this.capabilities,
            role: this.role,
            parent: this.parent,
            metadata: this.metadata,
            createdAt: this.createdAt.toISOString(),
            lastActive: this.lastActive.toISOString(),
        };
    }
}
