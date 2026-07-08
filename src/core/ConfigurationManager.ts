/**
 * Configuration Manager
 *
 * Persists user settings (pipeline mode, thresholds) to AsyncStorage.
 * Provides reactive access to the current configuration.
 *
 * Stored settings:
 *   - Pipeline mode (standard/enhanced/visualization)
 *   - Camera selection (front/back)
 *   - Custom threshold overrides
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PipelineConfig, PipelineMode } from '../types/pipeline';
import { DEFAULT_PIPELINE_CONFIG } from '../types/pipeline';
import { createLogger } from '../monitoring/Logger';

const log = createLogger('ConfigurationManager');

const STORAGE_KEY = '@ppulse_config';

/** Subset of config that is user-configurable and persisted. */
export interface UserConfig {
  mode: PipelineMode;
  cameraPosition: 'front' | 'back';
  amplificationFactor: number;
  measurementDurationSec: number;
}

const DEFAULT_USER_CONFIG: UserConfig = {
  mode: 'standard',
  cameraPosition: 'front',
  amplificationFactor: 30,
  measurementDurationSec: 30,
};

export class ConfigurationManager {
  private userConfig: UserConfig = { ...DEFAULT_USER_CONFIG };
  private loaded = false;

  /**
   * Load persisted configuration from AsyncStorage.
   * Call this once at app startup.
   */
  async load(): Promise<void> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<UserConfig>;
        this.userConfig = { ...DEFAULT_USER_CONFIG, ...parsed };
        log.info('Configuration loaded', this.userConfig);
      } else {
        log.info('No saved configuration, using defaults');
      }
    } catch (error) {
      log.warn('Failed to load configuration, using defaults', { error });
    }
    this.loaded = true;
  }

  /**
   * Persist the current configuration to AsyncStorage.
   */
  async save(): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.userConfig));
      log.info('Configuration saved');
    } catch (error) {
      log.warn('Failed to save configuration', { error });
    }
  }

  /**
   * Get the current user configuration.
   */
  getUserConfig(): Readonly<UserConfig> {
    return this.userConfig;
  }

  /**
   * Update one or more user config values and persist.
   */
  async update(partial: Partial<UserConfig>): Promise<void> {
    this.userConfig = { ...this.userConfig, ...partial };
    await this.save();
    log.info('Configuration updated', partial);
  }

  /**
   * Get the current pipeline mode.
   */
  getMode(): PipelineMode {
    return this.userConfig.mode;
  }

  /**
   * Set the pipeline mode and persist.
   */
  async setMode(mode: PipelineMode): Promise<void> {
    await this.update({ mode });
  }

  /**
   * Build a full PipelineConfig from user config + defaults.
   * This merges user overrides with the default pipeline parameters.
   */
  buildPipelineConfig(): PipelineConfig {
    return {
      ...DEFAULT_PIPELINE_CONFIG,
      mode: this.userConfig.mode,
      enhancement: {
        ...DEFAULT_PIPELINE_CONFIG.enhancement,
        amplificationFactor: this.userConfig.amplificationFactor,
      },
    };
  }

  /**
   * Reset to default configuration.
   */
  async reset(): Promise<void> {
    this.userConfig = { ...DEFAULT_USER_CONFIG };
    await this.save();
    log.info('Configuration reset to defaults');
  }

  /**
   * Whether the configuration has been loaded from storage.
   */
  isLoaded(): boolean {
    return this.loaded;
  }
}
