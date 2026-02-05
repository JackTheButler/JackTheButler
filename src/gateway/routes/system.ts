/**
 * System Status Routes
 *
 * Provides system health and status information for the dashboard.
 *
 * @module gateway/routes/system
 */

import { Hono } from 'hono';
import { getAppRegistry } from '@/apps/index.js';
import type { AIAppManifest } from '@/apps/types.js';
import { db, knowledgeBase, knowledgeEmbeddings } from '@/db/index.js';
import { count, isNull, eq } from 'drizzle-orm';

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
    ai: number;
    channel: number;
    pms: number;
    tool: number;
  };
  knowledgeBase: {
    total: number;
    withoutEmbeddings: number;
    needsReindex: boolean;
  };
}

const systemRoutes = new Hono();

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

  // Count active extensions by category
  const allExtensions = registry.getAll();
  const activeByCategory = {
    ai: 0,
    channel: 0,
    pms: 0,
    tool: 0,
  };

  for (const ext of allExtensions) {
    if (ext.status === 'active') {
      const category = ext.manifest.category as keyof typeof activeByCategory;
      if (category in activeByCategory) {
        activeByCategory[category]++;
      }
    }
  }

  // Check for no channels configured
  if (activeByCategory.channel === 0) {
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
  let knowledgeBaseTotal = 0;
  let knowledgeBaseWithoutEmbeddings = 0;

  const [totalResult] = await db.select({ count: count() }).from(knowledgeBase);
  knowledgeBaseTotal = totalResult?.count ?? 0;

  if (knowledgeBaseTotal > 0) {
    // Count entries without embeddings using left join
    const withoutEmbeddings = await db
      .select({ count: count() })
      .from(knowledgeBase)
      .leftJoin(knowledgeEmbeddings, eq(knowledgeBase.id, knowledgeEmbeddings.id))
      .where(isNull(knowledgeEmbeddings.id));
    knowledgeBaseWithoutEmbeddings = withoutEmbeddings[0]?.count ?? 0;
  }

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

  const status: SystemStatus = {
    healthy: issues.filter((i) => i.severity === 'critical').length === 0,
    issues,
    completedSteps,
    providers: {
      completion: completionProvider?.name ?? null,
      embedding: embeddingProvider?.name ?? null,
      completionIsLocal: completionProvider?.name === 'local',
      embeddingIsLocal: embeddingProvider?.name === 'local',
    },
    apps: activeByCategory,
    knowledgeBase: {
      total: knowledgeBaseTotal,
      withoutEmbeddings: knowledgeBaseWithoutEmbeddings,
      needsReindex: knowledgeBaseWithoutEmbeddings > 0,
    },
  };

  return c.json(status);
});

/**
 * GET /api/v1/system/capabilities
 * Returns what capabilities are available based on configured providers
 */
systemRoutes.get('/capabilities', async (c) => {
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

export { systemRoutes };
