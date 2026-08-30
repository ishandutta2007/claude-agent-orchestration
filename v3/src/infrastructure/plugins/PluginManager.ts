import { Plugin, PluginManagerInterface, ExtensionPoint } from '../../shared/types/index.js';

export interface PluginManagerOptions {
    eventBus?: any;
    coreVersion?: string;
}

/**
 * Manages the lifecycle and execution of plugins.
 */
export class PluginManager implements PluginManagerInterface {
    private plugins: Map<string, Plugin> = new Map();
    private extensionPoints: Map<string, Array<{ pluginId: string; handler: (context: unknown) => Promise<unknown>; priority?: number }>> = new Map();
    private eventBus: any;
    private coreVersion: string;

    constructor(options: PluginManagerOptions = {}) {
        this.coreVersion = options.coreVersion || '3.0.0';
        this.eventBus = options.eventBus;
    }

    public async initialize(): Promise<void> {
        // Core initialization logic
    }

    public async shutdown(): Promise<void> {
        for (const pluginId of Array.from(this.plugins.keys())) {
            await this.unloadPlugin(pluginId);
        }
    }

    public async loadPlugin(plugin: Plugin, config?: unknown): Promise<void> {
        if (this.plugins.has(plugin.id)) {
            throw new Error(`Plugin ${plugin.id} already loaded.`);
        }

        if (!this.checkVersionCompatibility(plugin.minCoreVersion, plugin.maxCoreVersion)) {
            throw new Error(`Plugin ${plugin.id} is not compatible with core version ${this.coreVersion}.`);
        }

        if (plugin.dependencies) {
            for (const dep of plugin.dependencies) {
                if (!this.plugins.has(dep)) {
                    throw new Error(`Plugin ${plugin.id} requires missing dependency: ${dep}`);
                }
            }
        }

        if (plugin.configSchema) {
            this.validateConfig(plugin.configSchema, config);
        }

        await plugin.initialize(config);

        const eps = plugin.getExtensionPoints();
        for (const ep of eps) {
            const list = this.extensionPoints.get(ep.name) || [];
            list.push({ pluginId: plugin.id, handler: ep.handler, priority: ep.priority });
            list.sort((a, b) => (b.priority || 0) - (a.priority || 0));
            this.extensionPoints.set(ep.name, list);
        }

        this.plugins.set(plugin.id, plugin);

        if (this.eventBus) {
            this.eventBus.emit('plugin:loaded', { id: plugin.id });
        }
    }

    public async unloadPlugin(id: string): Promise<void> {
        const plugin = this.plugins.get(id);
        if (!plugin) return;

        for (const p of this.plugins.values()) {
            if (p.dependencies && p.dependencies.includes(id)) {
                throw new Error(`Cannot unload ${id}, it is required by ${p.id}`);
            }
        }

        await plugin.shutdown();

        for (const [name, list] of this.extensionPoints.entries()) {
            this.extensionPoints.set(name, list.filter(ep => ep.pluginId !== id));
        }

        this.plugins.delete(id);

        if (this.eventBus) {
            this.eventBus.emit('plugin:unloaded', { id });
        }
    }

    public async reloadPlugin(id: string, plugin: Plugin): Promise<void> {
        await this.unloadPlugin(id);
        await this.loadPlugin(plugin);
    }

    public listPlugins(): Plugin[] {
        return Array.from(this.plugins.values());
    }

    public getPluginMetadata(id: string): Plugin | undefined {
        return this.plugins.get(id);
    }

    public async invokeExtensionPoint(name: string, context: unknown): Promise<unknown[]> {
        const handlers = this.extensionPoints.get(name) || [];
        const results = [];
        for (const ep of handlers) {
            try {
                results.push(await ep.handler(context));
            } catch (err) {
                console.error(`Error executing extension point ${name} for plugin ${ep.pluginId}:`, err);
            }
        }
        return results;
    }

    public getCoreVersion(): string {
        return this.coreVersion;
    }

    private parseVersion(version: string): number[] {
        return version.split('.').map(Number);
    }

    private compareVersions(v1: string, v2: string): number {
        const p1 = this.parseVersion(v1);
        const p2 = this.parseVersion(v2);
        for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
            const num1 = p1[i] || 0;
            const num2 = p2[i] || 0;
            if (num1 > num2) return 1;
            if (num1 < num2) return -1;
        }
        return 0;
    }

    private checkVersionCompatibility(min?: string, max?: string): boolean {
        if (min && this.compareVersions(this.coreVersion, min) < 0) return false;
        if (max && this.compareVersions(this.coreVersion, max) > 0) return false;
        return true;
    }

    private validateConfig(schema: unknown, config: unknown): void {
        // Config schema validation logic can be implemented here
    }
}
