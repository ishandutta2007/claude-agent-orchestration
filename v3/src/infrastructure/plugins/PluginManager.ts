import { Plugin } from './Plugin';
import { ExtensionPointRegistry } from './ExtensionPoint';

export interface PluginManagerOptions {
  eventBus: any;
  coreVersion: string;
}

/**
 * PluginManager manages the lifecycle of plugins and extension points.
 */
export class PluginManager {
  private plugins: Map<string, Plugin> = new Map();
  private extensionPoints: ExtensionPointRegistry = new ExtensionPointRegistry();
  private eventBus: any;
  private coreVersion: string;
  private initialized: boolean = false;

  constructor(options: PluginManagerOptions) {
    this.eventBus = options.eventBus;
    this.coreVersion = options.coreVersion;
  }

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  async shutdown(): Promise<void> {
    for (const pluginId of this.plugins.keys()) {
      await this.unloadPlugin(pluginId);
    }
    this.initialized = false;
  }

  async loadPlugin(plugin: Plugin, config?: any): Promise<void> {
    if (this.plugins.has(plugin.id)) {
      throw new Error(`Plugin ${plugin.id} is already loaded`);
    }

    this.validateConfig(plugin, config);
    this.checkVersionCompatibility(plugin);
    this.checkDependencies(plugin);

    if (typeof (plugin as any).initialize === 'function') {
      await (plugin as any).initialize(config);
    }

    this.registerExtensionPoints(plugin);
    this.plugins.set(plugin.id, plugin);
    this.eventBus?.emit('plugin:loaded', { pluginId: plugin.id });
  }

  async unloadPlugin(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return;

    for (const p of this.plugins.values()) {
      if (p.dependencies && p.dependencies[pluginId]) {
        throw new Error(`Cannot unload plugin ${pluginId}, it is required by ${p.id}`);
      }
    }

    if (typeof (plugin as any).shutdown === 'function') {
      await (plugin as any).shutdown();
    }

    if (typeof (plugin as any).getExtensionPoints === 'function') {
      const eps = (plugin as any).getExtensionPoints();
      for (const ep of eps) {
        this.extensionPoints.unregister(ep.name, plugin.id);
      }
    }

    this.plugins.delete(pluginId);
    this.eventBus?.emit('plugin:unloaded', { pluginId });
  }

  async reloadPlugin(pluginId: string, plugin: Plugin, config?: any): Promise<void> {
    await this.unloadPlugin(pluginId);
    await this.loadPlugin(plugin, config);
  }

  listPlugins(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  getPluginMetadata(pluginId: string): Plugin | undefined {
    return this.plugins.get(pluginId);
  }

  async invokeExtensionPoint(name: string, context: any): Promise<any[]> {
    return this.extensionPoints.invoke(name, context);
  }

  getCoreVersion(): string {
    return this.coreVersion;
  }

  private registerExtensionPoints(plugin: Plugin): void {
    if (typeof (plugin as any).getExtensionPoints === 'function') {
      const eps = (plugin as any).getExtensionPoints();
      for (const ep of eps) {
        this.extensionPoints.register(ep.name, plugin.id, ep.handler, ep.priority);
      }
    }
  }

  private validateConfig(plugin: Plugin, config: any): void {
    if (plugin.configSchema && !config) {
      // Configuration validation placeholder
    }
  }

  private checkVersionCompatibility(plugin: Plugin): void {
    if (plugin.minCoreVersion) {
      if (this.compareVersions(this.coreVersion, plugin.minCoreVersion) < 0) {
        throw new Error(`Core version ${this.coreVersion} is less than required min version ${plugin.minCoreVersion} for plugin ${plugin.id}`);
      }
    }
    if (plugin.maxCoreVersion) {
      if (this.compareVersions(this.coreVersion, plugin.maxCoreVersion) > 0) {
        throw new Error(`Core version ${this.coreVersion} is greater than allowed max version ${plugin.maxCoreVersion} for plugin ${plugin.id}`);
      }
    }
  }

  private checkDependencies(plugin: Plugin): void {
    if (plugin.dependencies) {
      for (const depId of Object.keys(plugin.dependencies)) {
        if (!this.plugins.has(depId)) {
          throw new Error(`Missing dependency ${depId} for plugin ${plugin.id}`);
        }
      }
    }
  }

  private parseVersion(version: string): number[] {
    return version.replace(/[^0-9.]/g, '').split('.').map(Number);
  }

  private compareVersions(v1: string, v2: string): number {
    const p1 = this.parseVersion(v1);
    const p2 = this.parseVersion(v2);
    const len = Math.max(p1.length, p2.length);
    for (let i = 0; i < len; i++) {
      const num1 = p1[i] || 0;
      const num2 = p2[i] || 0;
      if (num1 > num2) return 1;
      if (num1 < num2) return -1;
    }
    return 0;
  }
}
