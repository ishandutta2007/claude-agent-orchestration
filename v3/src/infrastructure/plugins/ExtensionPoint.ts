export interface RegisteredHandler {
  pluginId: string;
  handler: (...args: any[]) => any;
  priority: number;
}

/**
 * Manages named extension points, handles their execution and sorting by priority.
 */
export class ExtensionPointRegistry {
  private extensionPoints: Map<string, RegisteredHandler[]> = new Map();

  register(name: string, pluginId: string, handler: (...args: any[]) => any, priority: number = 0): void {
    const handlers = this.extensionPoints.get(name) || [];
    handlers.push({ pluginId, handler, priority });
    handlers.sort((a, b) => b.priority - a.priority); // sort by priority descending
    this.extensionPoints.set(name, handlers);
  }

  unregister(name: string, pluginId: string): void {
    const handlers = this.extensionPoints.get(name);
    if (handlers) {
      const updatedHandlers = handlers.filter(h => h.pluginId !== pluginId);
      if (updatedHandlers.length > 0) {
        this.extensionPoints.set(name, updatedHandlers);
      } else {
        this.extensionPoints.delete(name);
      }
    }
  }

  async invoke(name: string, context: any): Promise<any[]> {
    const handlers = this.extensionPoints.get(name) || [];
    const results = [];
    for (const handlerObj of handlers) {
      try {
        const result = await handlerObj.handler(context);
        results.push(result);
      } catch (error) {
        console.error(`Error invoking extension point ${name} for plugin ${handlerObj.pluginId}`, error);
      }
    }
    return results;
  }

  list(): string[] {
    return Array.from(this.extensionPoints.keys());
  }
}
