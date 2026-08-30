import { Plugin, ExtensionPoint } from '../../shared/types/index.js';

export { Plugin, ExtensionPoint };

/**
 * Base abstract class implementing the Plugin interface.
 */
export abstract class BasePlugin implements Plugin {
    public id: string;
    public name: string;
    public version: string;
    public description?: string;
    public author?: string;
    public homepage?: string;
    public priority?: number;
    public dependencies?: string[];
    public configSchema?: unknown;
    public minCoreVersion?: string;
    public maxCoreVersion?: string;
    protected extensionPoints: ExtensionPoint[] = [];

    /**
     * Initializes the BasePlugin.
     * @param config - Partial configuration for the plugin.
     */
    constructor(config: Partial<Plugin> = {}) {
        this.id = config.id || '';
        this.name = config.name || '';
        this.version = config.version || '';
        this.description = config.description;
        this.author = config.author;
        this.homepage = config.homepage;
        this.priority = config.priority;
        this.dependencies = config.dependencies;
        this.configSchema = config.configSchema;
        this.minCoreVersion = config.minCoreVersion;
        this.maxCoreVersion = config.maxCoreVersion;
    }

    /**
     * Initialize the plugin with optional config.
     * @param config - Optional configuration.
     */
    abstract initialize(config?: unknown): Promise<void>;

    /**
     * Shut down the plugin.
     */
    abstract shutdown(): Promise<void>;

    /**
     * Get the extension points exposed by this plugin.
     */
    public getExtensionPoints(): ExtensionPoint[] {
        return this.extensionPoints;
    }

    /**
     * Register an extension point for this plugin.
     * @param name - The name of the extension point.
     * @param handler - The handler function.
     * @param priority - Optional priority.
     */
    protected registerExtensionPoint(name: string, handler: (context: unknown) => Promise<unknown>, priority?: number): void {
        this.extensionPoints.push({ name, handler, priority });
    }
}
