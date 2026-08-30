import { ExtensionPoint } from '../../shared/types/index.js';

/**
 * Registry for managing extension points.
 */
export class ExtensionPointRegistry {
    private handlers: Map<string, Array<ExtensionPoint>> = new Map();

    /**
     * Registers a new extension point handler.
     * @param extensionPoint - The extension point to register.
     */
    public register(extensionPoint: ExtensionPoint): void {
        const list = this.handlers.get(extensionPoint.name) || [];
        list.push(extensionPoint);
        // Sort by priority descending
        list.sort((a, b) => (b.priority || 0) - (a.priority || 0));
        this.handlers.set(extensionPoint.name, list);
    }

    /**
     * Gets all handlers for a given extension point name.
     * @param name - The name of the extension point.
     */
    public getHandlers(name: string): ExtensionPoint[] {
        return this.handlers.get(name) || [];
    }
    
    /**
     * Clears all registered extension points.
     */
    public clear(): void {
        this.handlers.clear();
    }
    
    /**
     * Removes a specific handler from an extension point.
     * @param name - The name of the extension point.
     * @param handler - The handler function to remove.
     */
    public removeHandler(name: string, handler: (context: unknown) => Promise<unknown>): void {
        const list = this.handlers.get(name);
        if (list) {
            this.handlers.set(name, list.filter(ep => ep.handler !== handler));
        }
    }
}
