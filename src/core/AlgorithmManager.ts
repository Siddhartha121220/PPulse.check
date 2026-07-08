/**
 * Algorithm Manager
 *
 * Central registry for all processing plugins.
 * The pipeline never calls POS or EVM directly — it asks the
 * AlgorithmManager for the "current" plugin at each stage.
 *
 * This makes adding future algorithms trivial:
 *   1. Implement the plugin interface
 *   2. Register it here
 *   3. It's immediately available for selection
 *
 * The AlgorithmManager also provides mode presets that configure
 * all three stages at once (Standard, Enhanced, Visualization).
 */

import type {
  IEnhancementPlugin,
  ISignalExtractionPlugin,
  ISignalProcessingPlugin,
  PipelineMode,
  PluginInfo,
} from '../types/pipeline';
import { createLogger } from '../monitoring/Logger';

const log = createLogger('AlgorithmManager');

/** Mode preset configuration. */
interface ModePreset {
  enhancement: string;   // plugin id
  extraction: string;    // plugin id
  processing: string;    // plugin id
}

const MODE_PRESETS: Record<PipelineMode, ModePreset> = {
  standard: {
    enhancement: 'none',
    extraction: 'pos',
    processing: 'fft',
  },
  enhanced: {
    enhancement: 'evm',
    extraction: 'pos',
    processing: 'fft',
  },
  visualization: {
    enhancement: 'evm',
    extraction: 'none',  // no signal extraction in viz mode
    processing: 'none',  // no frequency analysis in viz mode
  },
};

export class AlgorithmManager {
  // Plugin registries
  private enhancements = new Map<string, IEnhancementPlugin>();
  private extractions = new Map<string, ISignalExtractionPlugin>();
  private processors = new Map<string, ISignalProcessingPlugin>();

  // Currently active plugin IDs
  private activeEnhancementId = 'none';
  private activeExtractionId = 'pos';
  private activeProcessingId = 'fft';

  // ── Registration ──────────────────────────────────────────────

  registerEnhancement(plugin: IEnhancementPlugin): void {
    this.enhancements.set(plugin.id, plugin);
    log.info('Registered enhancement plugin', { id: plugin.id, name: plugin.name });
  }

  registerExtraction(plugin: ISignalExtractionPlugin): void {
    this.extractions.set(plugin.id, plugin);
    log.info('Registered extraction plugin', { id: plugin.id, name: plugin.name });
  }

  registerProcessing(plugin: ISignalProcessingPlugin): void {
    this.processors.set(plugin.id, plugin);
    log.info('Registered processing plugin', { id: plugin.id, name: plugin.name });
  }

  // ── Selection ─────────────────────────────────────────────────

  setActiveEnhancement(id: string): void {
    if (!this.enhancements.has(id)) {
      log.warn('Enhancement plugin not found, keeping current', { requested: id });
      return;
    }
    this.activeEnhancementId = id;
    log.info('Active enhancement changed', { id });
  }

  setActiveExtraction(id: string): void {
    if (!this.extractions.has(id) && id !== 'none') {
      log.warn('Extraction plugin not found, keeping current', { requested: id });
      return;
    }
    this.activeExtractionId = id;
    log.info('Active extraction changed', { id });
  }

  setActiveProcessing(id: string): void {
    if (!this.processors.has(id) && id !== 'none') {
      log.warn('Processing plugin not found, keeping current', { requested: id });
      return;
    }
    this.activeProcessingId = id;
    log.info('Active processing changed', { id });
  }

  // ── Access ────────────────────────────────────────────────────

  getActiveEnhancement(): IEnhancementPlugin | null {
    return this.enhancements.get(this.activeEnhancementId) ?? null;
  }

  getActiveExtraction(): ISignalExtractionPlugin | null {
    if (this.activeExtractionId === 'none') return null;
    return this.extractions.get(this.activeExtractionId) ?? null;
  }

  getActiveProcessing(): ISignalProcessingPlugin | null {
    if (this.activeProcessingId === 'none') return null;
    return this.processors.get(this.activeProcessingId) ?? null;
  }

  getActiveIds(): { enhancement: string; extraction: string; processing: string } {
    return {
      enhancement: this.activeEnhancementId,
      extraction: this.activeExtractionId,
      processing: this.activeProcessingId,
    };
  }

  // ── Mode Presets ──────────────────────────────────────────────

  /**
   * Apply a mode preset, configuring all three stages at once.
   *
   * If a plugin required by the preset is not registered,
   * falls back to the current plugin for that stage.
   */
  applyMode(mode: PipelineMode): void {
    const preset = MODE_PRESETS[mode];
    log.info('Applying mode preset', { mode, preset });

    this.setActiveEnhancement(preset.enhancement);
    this.setActiveExtraction(preset.extraction);
    this.setActiveProcessing(preset.processing);
  }

  // ── Introspection ─────────────────────────────────────────────

  listEnhancements(): PluginInfo[] {
    return Array.from(this.enhancements.values()).map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
    }));
  }

  listExtractions(): PluginInfo[] {
    return Array.from(this.extractions.values()).map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
    }));
  }

  listProcessing(): PluginInfo[] {
    return Array.from(this.processors.values()).map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
    }));
  }

  // ── Lifecycle ─────────────────────────────────────────────────

  /**
   * Reset all active plugins (e.g., on session restart).
   */
  resetAllPlugins(): void {
    this.enhancements.forEach(p => p.reset());
    this.extractions.forEach(p => p.reset());
    this.processors.forEach(p => p.reset());
    log.info('All plugins reset');
  }

  /**
   * Dispose all plugins (e.g., on app shutdown).
   */
  disposeAll(): void {
    this.enhancements.forEach(p => p.dispose());
    this.extractions.forEach(p => p.dispose());
    this.processors.forEach(p => p.dispose());
    this.enhancements.clear();
    this.extractions.clear();
    this.processors.clear();
    log.info('All plugins disposed');
  }
}
