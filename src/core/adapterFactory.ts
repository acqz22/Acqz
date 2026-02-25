import type { LeadAdapter, PlatformKey } from './types';

export class AdapterFactory {
  constructor(private readonly adapters: Map<PlatformKey, LeadAdapter>) {}

  getAdapter(platform: PlatformKey): LeadAdapter {
    const adapter = this.adapters.get(platform);
    if (!adapter) {
      throw new Error(`Unsupported platform: ${platform}`);
    }

    return adapter;
  }
}
