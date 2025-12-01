import type { XeroAdapter } from './adapter-interface.js';
import { XeroMockAdapter } from './xero-mock-adapter.js';
import { XeroLiveAdapter } from './xero-live-adapter.js';

/**
 * Factory for creating Xero adapters based on the current mode.
 */
export class AdapterFactory {
  /**
   * Creates an adapter based on the MCP_MODE environment variable.
   * @param mode Override the mode (defaults to MCP_MODE env var or 'mock')
   */
  static create(mode?: string): XeroAdapter {
    const adapterMode = mode ?? process.env.MCP_MODE ?? 'mock';

    switch (adapterMode) {
      case 'mock':
        console.error('[AdapterFactory] Creating MOCK adapter (no Xero API calls)');
        return new XeroMockAdapter();

      case 'live':
        console.error('[AdapterFactory] Creating LIVE adapter (real Xero API)');
        return new XeroLiveAdapter();

      default:
        throw new Error(
          `Unknown MCP_MODE: '${adapterMode}'. Valid options: 'mock', 'live'`
        );
    }
  }
}

// Re-export types for convenience
export type { XeroAdapter } from './adapter-interface.js';
export * from './adapter-interface.js';
