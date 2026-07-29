/**
 * CapabilityRegistry — Central registry for all capabilities
 */

import { BaseCapability } from '../core/capability-protocol';
import { ChatCapability } from './chat/chat-capability';
import type { ToolRegistry } from '../tools/registry';

export class CapabilityRegistry {
  private capabilities = new Map<string, BaseCapability>();

  register(capability: BaseCapability): void {
    this.capabilities.set(capability.name, capability);
  }

  unregister(name: string): void {
    this.capabilities.delete(name);
  }

  get(name: string): BaseCapability | undefined {
    return this.capabilities.get(name);
  }

  has(name: string): boolean {
    return this.capabilities.has(name);
  }

  getAll(): BaseCapability[] {
    return Array.from(this.capabilities.values());
  }

  route(capabilityName: string): BaseCapability {
    const cap = this.capabilities.get(capabilityName);
    if (!cap) {
      throw new Error(`Capability "${capabilityName}" not registered`);
    }
    return cap;
  }

  getNames(): string[] {
    return Array.from(this.capabilities.keys());
  }
}

// ---------------------------------------------------------------------------
// Convenience registration helpers
// ---------------------------------------------------------------------------

/**
 * Register the built-in ChatCapability with the given registries.
 * Call this during application bootstrap to make chat available.
 */
export function registerChatCapability(
  capabilityRegistry: CapabilityRegistry,
  toolRegistry: ToolRegistry,
): void {
  capabilityRegistry.register(new ChatCapability(toolRegistry));
}
