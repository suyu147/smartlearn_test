/**
 * Capability Base — Convenience re-exports for the capability layer
 */
export {
  BaseCapability,
  LoopCapability,
  KnowledgeCapability,
  PipelineCapability,
  GraphCapability,
  createCapabilityManifest,
  DEFAULT_LOOP_CONFIG,
} from '../core/capability-protocol';
export type {
  CapabilityManifest,
  StreamBus,
  LoopCapabilityConfig,
} from '../core/capability-protocol';
