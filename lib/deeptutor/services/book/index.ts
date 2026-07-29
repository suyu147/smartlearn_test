/**
 * Book Engine — Barrel export
 */

export * from './models';
export { BookStorage, generateId, generatePageId } from './storage';
export { BookStream, BOOK_STAGES } from './stream';
export { BookEngine, type BookEngineConfig } from './engine';
export { BookCompiler, type CompilerOptions } from './compiler';
export { SectionArchitect, type BlockPlan } from './agents/section-architect';
export { IdeationAgent } from './agents/ideation-agent';
export { SpineSynthesizer } from './agents/spine-synthesizer';
export {
  BlockGeneratorRegistry,
  type BlockGenerator,
  type BlockGeneratorContext,
  type BlockGeneratorRegistryConfig,
} from './blocks/generators';
