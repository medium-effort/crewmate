import type { HarnessAdapter } from './types.js';
import { OpenCodeAdapter } from './adapters/opencode/adapter.js';
import { AntigravityAdapter } from './adapters/antigravity/adapter.js';

/**
 * Adapter Registry
 *
 * This registry manages all available harness adapters. To add a new adapter:
 *
 * 1. Create a new adapter class in src/harness/adapters/<name>.ts implementing HarnessAdapter
 * 2. Import the adapter here
 * 3. Add it to the adapters record below
 *
 * Example for dynamic imports (future enhancement):
 *
 * ```typescript
 * async function loadAdapter(name: string) {
 *   const adapterModule = await import(`./adapters/${name}.js`);
 *   const AdapterClass = adapterModule[capitalize(name) + "Adapter"];
 *   return new AdapterClass();
 * }
 * ```
 */

const antigravityAdapter = new AntigravityAdapter();

const adapters: Record<string, HarnessAdapter> = {
  opencode: new OpenCodeAdapter(),
  'antigravity-ide': antigravityAdapter,
};

// Fallback aliases for backward compatibility
const aliases: Record<string, string> = {
  antigravity: 'antigravity-ide',
};

/**
 * Get a specific adapter by name, with fallback alias support
 * @param name - The adapter identifier
 * @returns The adapter instance, or undefined if not found
 */
export function getAdapter(name: string): HarnessAdapter | undefined {
  const resolvedName = aliases[name] ?? name;
  return adapters[resolvedName];
}

/**
 * List all available adapters with their metadata
 * @returns Array of adapter objects with name, description, and other details
 */
export function listAdapters(): HarnessAdapter[] {
  return Object.values(adapters);
}

/**
 * Get names of all registered adapters (including backward-compatible aliases)
 * @returns Array of adapter identifiers
 */
export function listAdapterNames(): string[] {
  return [...Object.keys(adapters), ...Object.keys(aliases)];
}

/**
 * Check if an adapter is registered (including aliases)
 * @param name - The adapter identifier to check
 * @returns true if the adapter exists, false otherwise
 */
export function hasAdapter(name: string): boolean {
  const resolvedName = aliases[name] ?? name;
  return resolvedName in adapters;
}
