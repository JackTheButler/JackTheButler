/**
 * Setup Routes
 *
 * Public routes for the setup wizard (no auth required).
 * Used for fresh installations to configure the system.
 */

import { Hono } from 'hono';
import { setupService, type PropertyType, type AIProviderType } from '@/services/setup.js';
import { loadConfig } from '@/config/index.js';

const setup = new Hono();

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

export { setup as setupRoutes };
