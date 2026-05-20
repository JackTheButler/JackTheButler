import { eq } from 'drizzle-orm';
import type {
  AppDetail,
  AppStatus,
  AppSummary,
} from '@janetheoperator/shared';
import type {
  AppConfig,
  AppContract,
  AppModule,
  GenerationContract,
} from '@janetheoperator/shared/contracts';
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
  if (row?.lastError) return 'error'; // runtime failure
  return row?.enabled ? 'active' : 'disabled';
}

/**
 * Persist the result of an integration call (success clears the error).
 * Exported as `recordAppCallResult` so cross-cutting infra (the AI
 * pipeline) can report runtime outcomes the same way checkApp does.
 * Per design: runtime failures persist but do NOT auto-disable — only
 * admin-initiated save/test flips enabled off.
 */
function recordCallResult(id: string, result: { ok: boolean; detail?: string }) {
  db.update(appConfigs)
    .set({ lastError: result.ok ? null : (result.detail ?? 'unknown error') })
    .where(eq(appConfigs.appId, id))
    .run();
}

export const recordAppCallResult = recordCallResult;

/**
 * Return the live, runnable instance of the active generation AI app, or
 * null when none is configured + enabled + connected. The AI pipeline
 * resolves this per-turn so operator changes (enable/disable, key edits,
 * model swap) take effect on the next message without restarts.
 */
export function getActiveGenerationInstance(): GenerationContract | null {
  for (const module of getAppModules()) {
    if (module.manifest.category !== 'ai' || module.manifest.capability !== 'generation') {
      continue;
    }
    const row = rowFor(module.manifest.id);
    if (!row?.enabled) continue;
    const cfg = readConfig(row);
    if (!cfg || !module.validate(cfg).ok) continue;
    const instance: AppContract = module.createInstance(cfg);
    if ('generate' in instance && typeof (instance as GenerationContract).generate === 'function') {
      return instance as GenerationContract;
    }
  }
  return null;
}

async function runCheck(
  module: AppModule,
  cfg: AppConfig,
): Promise<{ ok: boolean; detail?: string }> {
  try {
    return await module.createInstance(cfg).check();
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : 'check failed' };
  }
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
    lastError: row?.lastError ?? null,
  };
}

export async function saveConfig(id: string, incoming: AppConfig): Promise<AppDetail> {
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

  // Write the new config and clear any prior runtime error.
  const blob = encrypt(JSON.stringify(merged));
  db.insert(appConfigs)
    .values({
      appId: id,
      config: blob,
      enabled: false,
      lastError: null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: appConfigs.appId,
      set: { config: blob, lastError: null, updatedAt: new Date() },
    })
    .run();

  // Auto-test on save. On failure, persist the reason and turn the
  // integration off — the operator must fix + re-save (or re-test) to
  // bring it back. On success, the cleared lastError stays cleared.
  const result = await runCheck(module, merged);
  if (!result.ok) {
    db.update(appConfigs)
      .set({ lastError: result.detail ?? 'check failed', enabled: false })
      .where(eq(appConfigs.appId, id))
      .run();
  }

  return getApp(id);
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
  const result = await runCheck(module, cfg);
  recordCallResult(id, result);
  return result;
}
