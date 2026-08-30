import { EventEmitter } from 'events';

export type AgentStatus = 'active' | 'idle' | 'busy' | 'terminated' | 'error';
export type AgentRole = 'leader' | 'worker' | 'peer';
export type AgentType = 'coder' | 'tester' | 'reviewer' | 'coordinator' | 'designer' | 'deployer' | string;

export interface AgentCapability {
    name: string;
    level?: number;
}

export interface AgentConfig {
    id: string;
    type: AgentType;
    capabilities?: AgentCapability[];
    role?: AgentRole;
    parent?: string;
    metadata?: Record<string, any>;
}

export interface Agent {
    id: string;
    type: AgentType;
    status: AgentStatus;
    capabilities: AgentCapability[];
    role: AgentRole;
    parent?: string;
    metadata: Record<string, any>;
    createdAt: Date;
    lastActive: Date;
    executeTask?: (task: Task) => Promise<TaskResult>;
}

export type TaskPriority = 'high' | 'medium' | 'low';
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
export type TaskType = string;

export interface Task {
    id: string;
    type: TaskType;
    description: string;
    priority: TaskPriority;
    status: TaskStatus;
    assignedTo?: string;
    dependencies: string[];
    metadata: Record<string, any>;
    workflow?: string;
    onExecute?: () => Promise<any>;
    onRollback?: () => Promise<void>;
}

export interface TaskResult {
    taskId: string;
    status: 'success' | 'failure';
    result?: any;
    error?: Error;
    duration: number;
    agentId: string;
}

export interface TaskAssignment {
    taskId: string;
    agentId: string;
    assignedAt: Date;
}

export type MemoryType = 'working' | 'episodic' | 'semantic' | 'procedural';

export interface Memory {
    id: string;
    agentId: string;
    content: string | Record<string, any>;
    type: MemoryType;
    timestamp: Date;
    embedding?: number[];
    metadata: Record<string, any>;
}

export interface MemoryQuery {
    agentId?: string;
    type?: MemoryType;
    timeRange?: {
        start: Date;
        end: Date;
    };
    metadata?: Record<string, any>;
    limit?: number;
    offset?: number;
}

export interface MemorySearchResult extends Memory {
    similarity: number;
}

export type WorkflowStatus = 'pending' | 'running' | 'completed' | 'failed' | 'paused';

export interface WorkflowState {
    status: WorkflowStatus;
    currentTaskId?: string;
    context: Record<string, any>;
}

export interface WorkflowDefinition {
    id: string;
    name: string;
    description?: string;
    tasks: Task[];
    entryPoint: string;
}

export interface WorkflowResult {
    workflowId: string;
    status: 'success' | 'failure';
    output?: any;
    error?: Error;
    metrics: WorkflowMetrics;
}

export interface WorkflowMetrics {
    duration: number;
    tasksCompleted: number;
    tasksFailed: number;
}

export interface WorkflowDebugInfo {
    stateHistory: WorkflowState[];
    events: any[];
}

export type SwarmTopology = 'hierarchical' | 'mesh' | 'simple' | 'adaptive';

export interface SwarmConfig {
    topology: SwarmTopology;
    memoryBackend?: MemoryBackend;
    eventBus?: EventEmitter;
    pluginManager?: PluginManagerInterface;
    maxAgents?: number;
}

export interface SwarmState {
    activeAgents: number;
    pendingTasks: number;
    topology: SwarmTopology;
}

export interface SwarmHierarchy {
    leaderId: string;
    workerIds: string[];
}

export interface MeshConnection {
    sourceId: string;
    targetId: string;
    strength: number;
}

export interface AgentMessage {
    id: string;
    sourceId: string;
    targetId: string;
    type: string;
    payload: any;
    timestamp: Date;
}

export interface AgentMetrics {
    tasksCompleted: number;
    totalActiveTime: number;
    errorRate: number;
}

export interface ConsensusDecision {
    id: string;
    topic: string;
    options: string[];
}

export interface ConsensusResult {
    decisionId: string;
    winningOption: string;
    votes: Record<string, number>;
}

export interface ExtensionPoint {
    name: string;
    handler: (...args: any[]) => any;
    priority: number;
}

export interface Plugin {
    id: string;
    name: string;
    version: string;
    description: string;
    author: string;
    homepage?: string;
    priority: number;
    dependencies?: Record<string, string>;
    configSchema?: Record<string, any>;
    minCoreVersion?: string;
    maxCoreVersion?: string;
    initialize: (config?: any) => Promise<void>;
    shutdown: () => Promise<void>;
    getExtensionPoints: () => ExtensionPoint[];
}

export interface PluginMetadata {
    id: string;
    version: string;
    isEnabled: boolean;
}

export interface PluginManagerInterface {
    registerPlugin(plugin: Plugin): void;
    unregisterPlugin(pluginId: string): void;
    getPlugin(pluginId: string): Plugin | undefined;
    getAllPlugins(): Plugin[];
}

export interface MCPServerOptions {
    host: string;
    port: number;
}

export interface MCPTool {
    name: string;
    description: string;
    execute: (args: any) => Promise<any>;
}

export interface MCPToolProvider {
    getTools(): MCPTool[];
}

export interface MCPToolResult {
    toolName: string;
    result: any;
}

export interface MCPRequest {
    type: string;
    payload: any;
}

export interface MCPResponse {
    type: string;
    payload: any;
}

export interface MemoryBackend {
    initialize(): Promise<void>;
    close(): Promise<void>;
    store(memory: Memory): Promise<void>;
    retrieve(id: string): Promise<Memory | undefined>;
    update(id: string, updates: Partial<Memory>): Promise<void>;
    delete(id: string): Promise<void>;
    query(query: MemoryQuery): Promise<Memory[]>;
    vectorSearch(embedding: number[], limit?: number): Promise<MemorySearchResult[]>;
    clearAgent(agentId: string): Promise<void>;
}

export interface SQLiteOptions {
    filename: string;
}

export interface AgentDBOptions {
    connectionString: string;
}

export interface AgentEvent {
    type: string;
    agentId: string;
    data: any;
    timestamp: Date;
}

export interface TaskEvent {
    type: string;
    taskId: string;
    data: any;
    timestamp: Date;
}

export interface WorkflowEvent {
    type: string;
    workflowId: string;
    data: any;
    timestamp: Date;
}

export interface PluginEvent {
    type: string;
    pluginId: string;
    data: any;
    timestamp: Date;
}

export class V3Error extends Error {
    constructor(
        message: string,
        public code: string,
        public details?: any
    ) {
        super(message);
        this.name = 'V3Error';
    }
}

export class ValidationError extends V3Error {
    constructor(message: string, details?: any) {
        super(message, 'VALIDATION_ERROR', details);
        this.name = 'ValidationError';
    }
}

export class ExecutionError extends V3Error {
    constructor(message: string, details?: any) {
        super(message, 'EXECUTION_ERROR', details);
        this.name = 'ExecutionError';
    }
}

export class CoordinationError extends V3Error {
    constructor(message: string, details?: any) {
        super(message, 'COORDINATION_ERROR', details);
        this.name = 'CoordinationError';
    }
}

export class PluginError extends V3Error {
    constructor(message: string, details?: any) {
        super(message, 'PLUGIN_ERROR', details);
        this.name = 'PluginError';
    }
}

export class MemoryError extends V3Error {
    constructor(message: string, details?: any) {
        super(message, 'MEMORY_ERROR', details);
        this.name = 'MemoryError';
    }
}
