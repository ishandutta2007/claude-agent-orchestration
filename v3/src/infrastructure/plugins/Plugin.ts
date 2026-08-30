export interface ExtensionPoint {
  name: string;
  handler: (...args: any[]) => any;
  priority?: number;
}

export interface Plugin {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  homepage?: string;
  priority?: number;
  dependencies?: Record<string, string>;
  configSchema?: any;
  minCoreVersion?: string;
  maxCoreVersion?: string;
}

/**
 * BasePlugin abstract class providing standard plugin functionality.
 */
export abstract class BasePlugin implements Plugin {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  homepage?: string;
  priority?: number;
  dependencies?: Record<string, string>;
  configSchema?: any;
  minCoreVersion?: string;
  maxCoreVersion?: string;
  
  protected extensionPoints: ExtensionPoint[] = [];

  constructor(config: Partial<Plugin> = {}) {
    this.id = config.id || '';
    this.name = config.name || '';
    this.version = config.version || '1.0.0';
    this.description = config.description || '';
    this.author = config.author || '';
    this.homepage = config.homepage;
    this.priority = config.priority;
    this.dependencies = config.dependencies;
    this.configSchema = config.configSchema;
    this.minCoreVersion = config.minCoreVersion;
    this.maxCoreVersion = config.maxCoreVersion;
  }

  abstract initialize(config?: any): Promise<void>;
  abstract shutdown(): Promise<void>;

  getExtensionPoints(): ExtensionPoint[] {
    return this.extensionPoints;
  }

  protected registerExtensionPoint(name: string, handler: (...args: any[]) => any, priority: number = 0): void {
    this.extensionPoints.push({ name, handler, priority });
  }
}
