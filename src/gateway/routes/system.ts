/**
 * System Status Routes
 *
 * Provides system health and status information for the dashboard.
 *
 * @module gateway/routes/system
 */

import { Hono } from 'hono';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { PERMISSIONS } from '@/permissions/index.js';
import { getAppRegistry } from '@/apps/index.js';
import { getVersion } from '@/config/version.js';
import type { AIAppManifest } from '@/apps/types.js';
import { systemService, describeError } from '@/services/system.js';

// describeError is a pure formatter re-exported here for backward compatibility —
// tests/gateway/system-logs.test.ts imports it directly from this module.
export { describeError };

/**
 * System issue severity levels
 */
type IssueSeverity = 'critical' | 'warning' | 'info';

/**
 * System issue with actionable information
 */
interface SystemIssue {
  type: string;
  severity: IssueSeverity;
  message: string;
  action?: {
    label: string;
    route: string;
  };
}

/**
 * Completed setup step
 */
interface CompletedStep {
  type: string;
  message: string;
}

/**
 * System status response
 */
interface SystemStatus {
  healthy: boolean;
  issues: SystemIssue[];
  completedSteps: CompletedStep[];
  providers: {
    completion: string | null;
    embedding: string | null;
    completionIsLocal: boolean;
    embeddingIsLocal: boolean;
  };
  apps: {
    ai: string[];
    channel: string[];
    pms: string[];
    tool: string[];
  };
  knowledgeBase: {
    total: number;
    withoutEmbeddings: number;
    needsReindex: boolean;
  };
  memories: {
    total: number;
    withEmbeddings: number;
  };
}

const systemRoutes = new Hono();

// Apply auth to all routes
systemRoutes.use('/*', requireAuth);

/**
 * GET /api/v1/system/status
 * Returns system health and critical issues
 */
systemRoutes.get('/status', async (c) => {
  const registry = getAppRegistry();
  const issues: SystemIssue[] = [];
  const completedSteps: CompletedStep[] = [];

  // Get providers
  const completionProvider = registry.getCompletionProvider();
  const embeddingProvider = registry.getEmbeddingProvider();

  // Check completion capability
  if (!completionProvider) {
    issues.push({
      type: 'no_completion_provider',
      severity: 'critical',
      message: 'No AI provider configured for conversations',
      action: { label: 'Configure AI', route: '/engine/apps/ai' },
    });
  } else if (completionProvider.name !== 'local') {
    completedSteps.push({
      type: 'completion_provider_configured',
      message: 'AI provider configured',
    });
  }

  // Check embedding capability
  if (!embeddingProvider) {
    issues.push({
      type: 'no_embedding_provider',
      severity: 'critical',
      message: 'Knowledge search disabled. Enable Local AI or OpenAI for embeddings.',
      action: { label: 'Configure AI', route: '/engine/apps/ai' },
    });
  } else {
    completedSteps.push({
      type: 'embedding_provider_configured',
      message: 'Embeddings enabled',
    });
  }

  // Check if using local completion (warn about quality/speed)
  if (completionProvider?.name === 'local') {
    issues.push({
      type: 'using_local_completion',
      severity: 'warning',
      message: 'Using local AI for responses (slower, lower quality than cloud AI)',
      action: { label: 'Configure Cloud AI', route: '/engine/apps/ai' },
    });
  }

  // Count active extensions by category and collect active app identifiers
  const allExtensions = registry.getAll();
  const activeByCategory: { ai: string[]; channel: string[]; pms: string[]; tool: string[] } = {
    ai: [],
    channel: [],
    pms: [],
    tool: [],
  };
  for (const ext of allExtensions) {
    if (ext.status === 'active') {
      const category = ext.manifest.category as keyof typeof activeByCategory;
      if (category in activeByCategory) {
        activeByCategory[category].push(ext.manifest.id);
      }
    }
  }

  // Check for no channels configured
  if (activeByCategory.channel.length === 0) {
    issues.push({
      type: 'no_channels',
      severity: 'warning',
      message: 'No messaging channels configured',
      action: { label: 'Configure Channels', route: '/engine/apps' },
    });
  } else {
    completedSteps.push({
      type: 'channels_configured',
      message: 'Messaging channels connected',
    });
  }

  // Check knowledge base status
  const { total: knowledgeBaseTotal, withoutEmbeddings: knowledgeBaseWithoutEmbeddings } =
    await systemService.getKnowledgeBaseCounts();

  // Check for empty knowledge base (only if embeddings are available)
  if (embeddingProvider) {
    if (knowledgeBaseTotal === 0) {
      issues.push({
        type: 'empty_knowledge_base',
        severity: 'warning',
        message: 'Knowledge base is empty',
        action: { label: 'Add Content', route: '/tools/site-scraper' },
      });
    } else {
      completedSteps.push({
        type: 'knowledge_base_populated',
        message: 'Knowledge base populated',
      });

      // Check if reindex is needed
      if (knowledgeBaseWithoutEmbeddings > 0) {
        issues.push({
          type: 'needs_reindex',
          severity: 'warning',
          message: `${knowledgeBaseWithoutEmbeddings} entries need reindexing`,
          action: { label: 'Reindex', route: '/tools/knowledge-base' },
        });
      }
    }
  }

  // Count guest memories
  const memories = await systemService.getMemoryCounts();

  const status: SystemStatus & { version: string } = {
    version: getVersion(),
    healthy: issues.filter((i) => i.severity === 'critical').length === 0,
    issues,
    completedSteps,
    providers: {
      completion: completionProvider?.name ?? null,
      embedding: embeddingProvider?.name ?? null,
      completionIsLocal: completionProvider?.name === 'local',
      embeddingIsLocal: embeddingProvider?.name === 'local',
    },
    apps: { ...activeByCategory },
    knowledgeBase: {
      total: knowledgeBaseTotal,
      withoutEmbeddings: knowledgeBaseWithoutEmbeddings,
      needsReindex: knowledgeBaseWithoutEmbeddings > 0,
    },
    memories,
  };

  return c.json(status);
});

/**
 * GET /api/v1/system/capabilities
 * Returns what capabilities are available based on configured providers
 */
systemRoutes.get('/capabilities', requirePermission(PERMISSIONS.SETTINGS_VIEW), async (c) => {
  const registry = getAppRegistry();

  const completionProvider = registry.getCompletionProvider();
  const embeddingProvider = registry.getEmbeddingProvider();

  // Get capabilities from active AI providers
  const aiExtensions = registry.getActiveByCategory('ai');
  const capabilities = {
    completion: !!completionProvider,
    embedding: !!embeddingProvider,
    streaming: false,
  };

  // Check if any provider supports streaming
  for (const ext of aiExtensions) {
    const manifest = ext.manifest as AIAppManifest;
    if (manifest.capabilities?.streaming) {
      capabilities.streaming = true;
      break;
    }
  }

  return c.json({
    capabilities,
    providers: {
      completion: completionProvider?.name ?? null,
      embedding: embeddingProvider?.name ?? null,
    },
  });
});

/**
 * GET /api/v1/system/health
 * Returns one health card per active connected app.
 */
systemRoutes.get('/health', requirePermission(PERMISSIONS.HEALTH_VIEW), (c) => {
  const registry = getAppRegistry();
  const activeApps = registry.getAll().filter((a) => a.status === 'active');

  const results = systemService.getAppHealth(activeApps);

  return c.json({ apps: results });
});

/**
 * GET /api/v1/system/logs
 * Returns a unified log stream from both activity_log and app_logs tables.
 * Supports server-side filtering by source, status, and date range.
 */
systemRoutes.get('/logs', requirePermission(PERMISSIONS.HEALTH_VIEW), (c) => {
  const result = systemService.getUnifiedLogs({
    source: c.req.query('source'),
    status: c.req.query('status'),
    from: c.req.query('from'),
    to: c.req.query('to'),
    since: c.req.query('since'),
    limit: c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : undefined,
    offset: c.req.query('offset') ? parseInt(c.req.query('offset')!, 10) : undefined,
  });

  return c.json(result);
});

export { systemRoutes };
