/**
 * Setup Routes
 *
 * Public routes for the setup wizard (no auth required).
 * Used for fresh installations to configure the system.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { setupService, type PropertyType, type AIProviderType } from '@/services/setup.js';
import { loadConfig } from '@/config/index.js';
import { createLogger } from '@/utils/logger.js';

const log = createLogger('routes:setup');

const setup = new Hono();

/**
 * Security middleware: Block setup modification after completion
 * Only GET /state and POST /reset (in dev) are allowed after setup is complete
 */
setup.use('*', async (c, next) => {
  // Allow GET /state always (for checking status)
  if (c.req.method === 'GET' && c.req.path.endsWith('/state')) {
    return next();
  }

  // Allow POST /reset in development (handled by the route itself)
  if (c.req.method === 'POST' && c.req.path.endsWith('/reset')) {
    return next();
  }

  const state = await setupService.getState();
  if (state.status === 'completed') {
    log.warn({ path: c.req.path, method: c.req.method }, 'Blocked setup access after completion');
    return c.json(
      {
        error: {
          code: 'SETUP_ALREADY_COMPLETED',
          message: 'Setup has already been completed',
        },
      },
      403
    );
  }

  return next();
});

/**
 * GET /api/v1/setup/state
 * Get current setup state
 */
setup.get('/state', async (c) => {
  const state = await setupService.getState();

  return c.json({
    status: state.status,
    currentStep: state.currentStep,
    completedSteps: state.completedSteps,
    context: state.context,
    isFreshInstall: state.status !== 'completed',
  });
});

/**
 * POST /api/v1/setup/start
 * Start the setup wizard
 * Enables Local AI and begins the bootstrap step
 */
setup.post('/start', async (c) => {
  const state = await setupService.start();

  return c.json({
    status: state.status,
    currentStep: state.currentStep,
    message: 'Setup started, Local AI enabled',
  });
});

/**
 * POST /api/v1/setup/bootstrap
 * Complete the bootstrap step
 * Moves to welcome/property name step
 */
setup.post('/bootstrap', async (c) => {
  const state = await setupService.completeBootstrap();

  return c.json({
    status: state.status,
    currentStep: state.currentStep,
    completedSteps: state.completedSteps,
  });
});

/**
 * POST /api/v1/setup/welcome
 * Save property info and complete setup
 * Body: { name: string, type: PropertyType }
 */
setup.post('/welcome', async (c) => {
  const body = await c.req.json<{
    name: string;
    type: PropertyType;
  }>();

  if (!body.name || typeof body.name !== 'string') {
    return c.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Property name is required',
        },
      },
      400
    );
  }

  const validTypes: PropertyType[] = ['hotel', 'bnb', 'vacation_rental', 'other'];
  if (!body.type || !validTypes.includes(body.type)) {
    return c.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Valid property type is required (hotel, bnb, vacation_rental, other)',
        },
      },
      400
    );
  }

  const state = await setupService.savePropertyInfo(body.name.trim(), body.type);

  return c.json({
    status: state.status,
    currentStep: state.currentStep,
    completedSteps: state.completedSteps,
    context: state.context,
    message: 'Property info saved',
  });
});

/**
 * POST /api/v1/setup/ai-provider
 * Configure AI provider and complete setup
 * Body: { provider: 'local' | 'anthropic' | 'openai', apiKey?: string }
 */
setup.post('/ai-provider', async (c) => {
  const body = await c.req.json<{
    provider: AIProviderType;
    apiKey?: string;
  }>();

  const validProviders: AIProviderType[] = ['local', 'anthropic', 'openai'];
  if (!body.provider || !validProviders.includes(body.provider)) {
    return c.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Valid provider is required (local, anthropic, openai)',
        },
      },
      400
    );
  }

  // Require API key for cloud providers
  if (body.provider !== 'local' && !body.apiKey) {
    return c.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'API key is required for cloud AI providers',
        },
      },
      400
    );
  }

  const result = await setupService.configureAIProvider(body.provider, body.apiKey);

  if (!result.success) {
    return c.json(
      {
        error: {
          code: 'AI_VALIDATION_FAILED',
          message: result.error || 'Failed to validate AI provider',
        },
        state: {
          status: result.state.status,
          currentStep: result.state.currentStep,
        },
      },
      400
    );
  }

  return c.json({
    status: result.state.status,
    currentStep: result.state.currentStep,
    completedSteps: result.state.completedSteps,
    context: result.state.context,
    message: 'AI provider configured, setup completed',
  });
});

/**
 * POST /api/v1/setup/knowledge/complete
 * Complete knowledge gathering and move to admin creation
 */
setup.post('/knowledge/complete', async (c) => {
  const state = await setupService.completeKnowledge();

  return c.json({
    status: state.status,
    currentStep: state.currentStep,
    completedSteps: state.completedSteps,
    message: 'Knowledge gathering completed, moving to admin creation',
  });
});

/**
 * POST /api/v1/setup/create-admin
 * Create admin account and complete setup
 * Body: { email: string, password: string, name: string }
 */
setup.post('/create-admin', async (c) => {
  const body = await c.req.json<{
    email: string;
    password: string;
    name: string;
  }>();

  // Validate email
  if (!body.email || typeof body.email !== 'string') {
    return c.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Email is required',
        },
      },
      400
    );
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(body.email)) {
    return c.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Please enter a valid email address',
        },
      },
      400
    );
  }

  // Validate password
  if (!body.password || typeof body.password !== 'string') {
    return c.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Password is required',
        },
      },
      400
    );
  }

  if (body.password.length < 8) {
    return c.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Password must be at least 8 characters',
        },
      },
      400
    );
  }

  // Validate name
  if (!body.name || typeof body.name !== 'string' || body.name.trim().length < 2) {
    return c.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Name is required (at least 2 characters)',
        },
      },
      400
    );
  }

  const result = await setupService.createAdminAccount(
    body.email,
    body.password,
    body.name
  );

  if (!result.success) {
    return c.json(
      {
        error: {
          code: 'ADMIN_CREATION_FAILED',
          message: result.error || 'Failed to create admin account',
        },
        state: {
          status: result.state.status,
          currentStep: result.state.currentStep,
        },
      },
      400
    );
  }

  return c.json({
    status: result.state.status,
    currentStep: result.state.currentStep,
    completedSteps: result.state.completedSteps,
    message: 'Admin account created, setup completed',
  });
});

/**
 * POST /api/v1/setup/skip
 * Skip setup and go directly to login
 */
setup.post('/skip', async (c) => {
  const state = await setupService.skip();

  return c.json({
    status: state.status,
    message: 'Setup skipped',
  });
});

/**
 * POST /api/v1/setup/reset
 * Reset setup state (development only)
 */
setup.post('/reset', async (c) => {
  const config = loadConfig();

  if (config.env === 'production') {
    return c.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: 'Setup reset is not available in production',
        },
      },
      403
    );
  }

  const state = await setupService.reset();

  return c.json({
    status: state.status,
    message: 'Setup state reset',
  });
});

/**
 * POST /api/v1/setup/sync-profile
 * Sync hotel profile from knowledge base entries
 * Extracts structured data (check-in/out times, contact, address) from knowledge
 */
setup.post('/sync-profile', async (c) => {
  try {
    const profile = await setupService.syncProfileFromKnowledge();

    return c.json({
      message: 'Profile synced from knowledge base',
      profile,
    });
  } catch (error) {
    log.error({ error }, 'Failed to sync profile from knowledge');

    return c.json(
      {
        error: {
          code: 'SYNC_FAILED',
          message: 'Failed to sync profile from knowledge base',
        },
      },
      500
    );
  }
});

/**
 * Process message request schema
 */
const processMessageSchema = z.object({
  message: z.string().min(1),
  step: z.string(),
  propertyName: z.string().default('your property'),
  propertyType: z.string().default('property'),
  question: z.string(),
});

/**
 * POST /api/v1/setup/process-message
 * Process a user message with AI to determine intent and action
 */
setup.post('/process-message', async (c) => {
  const body = await c.req.json();
  const parsed = processMessageSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: parsed.error.issues,
        },
      },
      400
    );
  }

  const result = await setupService.processMessage(parsed.data);

  return c.json(result);
});

export { setup as setupRoutes };
