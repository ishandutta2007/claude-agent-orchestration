import { Memory as IMemory, MemoryType } from '../../shared/types/index.js';
import { v4 as uuidv4 } from 'uuid'; // Ensure you have uuid installed if needed, or implement a simple generator

/**
 * Domain entity representing Memory in the claude-flow V3 framework.
 */
export class MemoryEntity implements IMemory {
    public id: string;
    public agentId: string;
    public content: string | Record<string, any>;
    public type: MemoryType;
    public timestamp: Date;
    public embedding?: number[];
    public metadata: Record<string, any>;

    constructor(config: IMemory) {
        this.id = config.id;
        this.agentId = config.agentId;
        this.content = config.content;
        this.type = config.type;
        this.timestamp = config.timestamp || new Date();
        this.embedding = config.embedding;
        this.metadata = config.metadata || {};
    }

    /**
     * Factory method to create a MemoryEntity from a config object.
     */
    public static fromConfig(config: IMemory): MemoryEntity {
        return new MemoryEntity(config);
    }

    /**
     * Checks if this memory has an embedding vector.
     */
    public hasEmbedding(): boolean {
        return Array.isArray(this.embedding) && this.embedding.length > 0;
    }

    /**
     * Gets the dimension of the embedding vector. Returns 0 if none exists.
     */
    public getEmbeddingDimension(): number {
        return this.hasEmbedding() ? this.embedding!.length : 0;
    }

    /**
     * Updates the memory content and implicitly updates the timestamp.
     */
    public updateContent(newContent: string | Record<string, any>): void {
        this.content = newContent;
        this.timestamp = new Date();
    }

    /**
     * Sets or updates the embedding vector.
     */
    public setEmbedding(embedding: number[]): void {
        this.embedding = embedding;
    }

    /**
     * Updates the metadata with new key-value pairs.
     */
    public updateMetadata(newMetadata: Record<string, any>): void {
        this.metadata = { ...this.metadata, ...newMetadata };
    }

    /**
     * Simple matching logic for query metadata against this memory's metadata.
     */
    public matches(query: Record<string, any>): boolean {
        for (const [key, value] of Object.entries(query)) {
            if (this.metadata[key] !== value) {
                return false;
            }
        }
        return true;
    }

    /**
     * Gets the age of the memory in milliseconds.
     */
    public getAge(): number {
        return Date.now() - this.timestamp.getTime();
    }

    /**
     * Serializes the memory to JSON.
     */
    public toJSON(): Record<string, any> {
        return {
            id: this.id,
            agentId: this.agentId,
            content: this.content,
            type: this.type,
            timestamp: this.timestamp.toISOString(),
            embedding: this.embedding,
            metadata: this.metadata,
        };
    }

    /**
     * Factory method for creating task-related working memory.
     */
    public static createTaskMemory(agentId: string, taskId: string, content: any): MemoryEntity {
        return new MemoryEntity({
            id: `mem-task-${taskId}-${Date.now()}`,
            agentId,
            type: 'working',
            content,
            timestamp: new Date(),
            metadata: { taskId }
        });
    }

    /**
     * Factory method for creating context/semantic memory.
     */
    public static createContextMemory(agentId: string, contextId: string, content: any): MemoryEntity {
        return new MemoryEntity({
            id: `mem-ctx-${contextId}-${Date.now()}`,
            agentId,
            type: 'semantic',
            content,
            timestamp: new Date(),
            metadata: { contextId }
        });
    }

    /**
     * Factory method for creating event/episodic memory.
     */
    public static createEventMemory(agentId: string, eventName: string, content: any): MemoryEntity {
        return new MemoryEntity({
            id: `mem-evt-${Date.now()}`,
            agentId,
            type: 'episodic',
            content,
            timestamp: new Date(),
            metadata: { eventName }
        });
    }
}
