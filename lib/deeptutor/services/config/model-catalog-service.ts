/**
 * ModelCatalogService - Model Catalog Persistence
 *
 * Manages model catalog storage via the DtModelCatalog Prisma model.
 * Each user can have separate catalogs for different services (llm, embedding, search).
 */

import { createLogger } from '@/lib/logger';
import { prisma } from '@/lib/utils/database';

const log = createLogger('ModelCatalogService');

export interface ModelProfile {
  id: string;
  name: string;
  baseUrl: string;
  apiKeyRef: string;  // reference to DtApiKey provider, not the actual key
  binding: string;    // 'openai' | 'anthropic' | 'google'
  extraHeaders?: Record<string, string>;
  apiVersion?: string;
  models: Array<{ id: string; name: string; model: string }>;
}

export interface ServiceCatalog {
  activeProfileId: string | null;
  activeModelId: string | null;
  profiles: ModelProfile[];
}

type ServiceType = 'llm' | 'embedding' | 'search';

/** Default empty catalog */
function emptyCatalog(): ServiceCatalog {
  return {
    activeProfileId: null,
    activeModelId: null,
    profiles: [],
  };
}

export class ModelCatalogService {
  /**
   * Load the catalog for a user and service.
   * Returns a default empty catalog if none exists.
   */
  async load(userId: string, service: ServiceType): Promise<ServiceCatalog> {
    const record = await prisma.dtModelCatalog.findUnique({
      where: { userId_service: { userId, service } },
    });

    if (!record) {
      return emptyCatalog();
    }

    try {
      const catalog = record.catalog as unknown as ServiceCatalog;
      // Validate shape minimally
      if (
        typeof catalog === 'object' &&
        catalog !== null &&
        'profiles' in catalog &&
        Array.isArray(catalog.profiles)
      ) {
        return catalog;
      }
      log.warn(`Invalid catalog shape for user=${userId}, service=${service}, returning empty`);
      return emptyCatalog();
    } catch (err) {
      log.error(`Failed to parse catalog for user=${userId}, service=${service}:`, err);
      return emptyCatalog();
    }
  }

  /**
   * Save the catalog for a user and service.
   * Creates or updates the record.
   */
  async save(userId: string, service: string, catalog: ServiceCatalog): Promise<void> {
    await prisma.dtModelCatalog.upsert({
      where: { userId_service: { userId, service } },
      update: {
        catalog: JSON.parse(JSON.stringify(catalog)),
      },
      create: {
        userId,
        service,
        catalog: JSON.parse(JSON.stringify(catalog)),
      },
    });

    log.info(
      `Saved catalog for user=${userId}, service=${service} ` +
        `(${catalog.profiles.length} profiles)`,
    );
  }

  /**
   * Get the active profile for a user and service.
   * Returns null if no catalog or no active profile is set.
   */
  async getActiveProfile(userId: string, service: string): Promise<ModelProfile | null> {
    const catalog = await this.load(userId, service as ServiceType);

    if (!catalog.activeProfileId) {
      return null;
    }

    const profile = catalog.profiles.find((p) => p.id === catalog.activeProfileId);
    return profile ?? null;
  }

  /**
   * Get the active model for a user and service.
   * Returns null if no catalog, no active profile, or no active model is set.
   */
  async getActiveModel(
    userId: string,
    service: string,
  ): Promise<{ id: string; name: string; model: string } | null> {
    const catalog = await this.load(userId, service as ServiceType);

    if (!catalog.activeProfileId || !catalog.activeModelId) {
      return null;
    }

    const profile = catalog.profiles.find((p) => p.id === catalog.activeProfileId);
    if (!profile) {
      return null;
    }

    const model = profile.models.find((m) => m.id === catalog.activeModelId);
    return model ?? null;
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let instance: ModelCatalogService | null = null;

export function getModelCatalogService(): ModelCatalogService {
  if (!instance) {
    instance = new ModelCatalogService();
  }
  return instance;
}
