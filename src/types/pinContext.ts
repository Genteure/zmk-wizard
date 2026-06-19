import type { KscanDriver } from './keyboard';

/** Minimal part context needed to resolve display names and build assignment options. */
export interface PartPinContext {
  name: string;
  kscans: readonly { id: string; kind: KscanDriver['kind'] }[];
  encoders: readonly { id: string }[];
}
