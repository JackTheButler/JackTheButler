import { eq } from 'drizzle-orm';
import type {
  AppDetail,
  AppStatus,
  AppSummary,
} from '@janetheoperator/shared';
import type { AppConfig, AppModule } from '@janetheoperator/shared/contracts';
import { db } from '@/db/client.js';
import { appConfigs, type AppConfigRow } from '@/db/schema/index.js';
import { AppError } from '@/core/errors.js';
import { getAppModules, findModule } from '@/modules/apps/registry.js';
import { encrypt, decrypt } from '@/modules/apps/crypto.js';

/** Transport-agnostic apps framework: registry + encrypted config + lifecycle. */

const MASK = '********';

function moduleOrThrow(id: string): AppModule {
  const m = findModule(id);
  if (!m) throw new AppError('app_not_found', 404);
  return m;
}

function rowFor(id: string): AppConfigRow | undefined {
  return db.select().from(appConfigs).where(eq(appConfigs.appId, id)).get();
}

function readConfig(row: AppConfigRow | undefined): AppConfig | null {
  if (!row?.config) return null;
  return JSON.parse(decrypt(row.config)) as AppConfig;
}

function deriveStatus(module: AppModule, row: AppConfigRow | undefined): AppStatus {
  const cfg = readConfig(row);
  if (!cfg) return 'unconfigured';
  if (!module.validate(cfg).ok) return 'error';
  return row?.enabled ? 'active' : 'disabled';
}

/** Secret field values are never returned — masked if set, omitted if not. */
function maskConfig(module: AppModule, cfg: AppConfig | null): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of module.manifest.configFields) {
    const v = cfg?.[f.key];
    if (f.secret) {
      if (v !== undefined && v !== '') out[f.key] = MASK;
    } else if (v !== undefined) {
      out[f.key] = v;
    }
  }
  return out;
}

export function listApps(): AppSummary[] {
  return getAppModules().map((m) => {
    const row = rowFor(m.manifest.id);
    return {
      id: m.manifest.id,
      name: m.manifest.name,
      description: m.manifest.description ?? '',
      category: m.manifest.category,
      enabled: row?.enabled ?? false,
      status: deriveStatus(m, row),
    };
  });
}

export function getApp(id: string): AppDetail {
  const module = moduleOrThrow(id);
  const row = rowFor(id);
  return {
    manifest: module.manifest,
    enabled: row?.enabled ?? false,
    status: deriveStatus(module, row),
    config: maskConfig(module, readConfig(row)),
  };
}

export function saveConfig(id: string, incoming: AppConfig): void {
  const module = moduleOrThrow(id);

  // Re-submitting a masked secret keeps the stored value (edit non-secrets
  // without re-entering keys).
  const existing = readConfig(rowFor(id)) ?? {};
  const merged: AppConfig = { ...incoming };
  for (const f of module.manifest.configFields) {
    if (f.secret && incoming[f.key] === MASK) merged[f.key] = existing[f.key];
  }

  const validation = module.validate(merged);
  if (!validation.ok) throw new AppError('invalid_config', 400, validation.errors);

  const blob = encrypt(JSON.stringify(merged));
  db.insert(appConfigs)
    .values({ appId: id, config: blob, enabled: false, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appConfigs.appId,
      set: { config: blob, updatedAt: new Date() },
    })
    .run();
}

export function setEnabled(id: string, enabled: boolean): void {
  moduleOrThrow(id);
  db.insert(appConfigs)
    .values({ appId: id, enabled, config: null, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appConfigs.appId,
      set: { enabled, updatedAt: new Date() },
    })
    .run();
}

export async function checkApp(id: string): Promise<{ ok: boolean; detail?: string }> {
  const module = moduleOrThrow(id);
  const cfg = readConfig(rowFor(id));
  if (!cfg || !module.validate(cfg).ok) throw new AppError('app_not_configured', 409);
  return module.createInstance(cfg).check();
}
