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
import { getAppRegistry } from '@/apps/registry.js';
import { createLogger } from '@/utils/logger.js';

const log = createLogger('routes:setup');

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
 * Step configuration for AI processing
 */
interface StepConfig {
  purpose: string;
  expectedAnswer: string;
  canSkip: boolean;
  skipNextStep?: string;
  validation?: (value: string) => { valid: boolean; normalized?: string; error?: string };
}

const stepConfigs: Record<string, StepConfig> = {
  ask_website: {
    purpose: 'Collect the property website URL to learn about the property',
    expectedAnswer: 'A website URL (e.g., grandhotel.com or https://grandhotel.com)',
    canSkip: true,
    skipNextStep: 'ask_manual_checkin',
    validation: (value: string) => {
      let url = value.trim();
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }
      try {
        new URL(url);
        return { valid: true, normalized: url };
      } catch {
        return { valid: false, error: 'Invalid URL format' };
      }
    },
  },
  ask_manual_checkin: {
    purpose: 'Collect check-in and check-out times for the property',
    expectedAnswer: 'Check-in and check-out times (e.g., "Check-in: 3pm, Check-out: 11am")',
    canSkip: false,
  },
  ask_manual_room: {
    purpose: 'Collect information about room types at the property',
    expectedAnswer: 'Room type description (name, features, price range)',
    canSkip: false,
  },
  ask_manual_contact: {
    purpose: 'Collect contact information for the property',
    expectedAnswer: 'Contact details (phone, email, or address)',
    canSkip: false,
  },
  ask_manual_location: {
    purpose: 'Collect the property location and address',
    expectedAnswer: 'Property address or location description',
    canSkip: false,
  },
};

/**
 * Build the AI prompt for message processing
 */
function buildProcessMessagePrompt(
  message: string,
  _step: string,
  stepConfig: StepConfig,
  propertyName: string,
  propertyType: string,
  question: string
): string {
  return `You are Jack, an AI assistant helping set up a hospitality management system for "${propertyName}" (a ${propertyType}).

CURRENT STEP: ${stepConfig.purpose}
QUESTION ASKED: "${question}"
EXPECTED ANSWER: ${stepConfig.expectedAnswer}
CAN SKIP: ${stepConfig.canSkip ? 'Yes - user can skip this step' : 'No - this information is required'}

USER'S MESSAGE: "${message}"

Analyze the user's message and determine their intent:

1. **answer** - They provided the requested information (even if informal like "3pm to 11am" for check-in times)
2. **question** - They're asking for clarification or more information
3. **skip** - They want to skip this step or don't have the information${stepConfig.canSkip ? '' : ' (not allowed for this step)'}
4. **unclear** - The message is unclear or off-topic

Respond with a JSON object:
{
  "intent": "answer" | "question" | "skip" | "unclear",
  "response": "Your helpful response to the user",
  "extractedValue": "The value extracted from their answer (only for intent=answer)"
}

Guidelines:
- Be friendly and conversational, not robotic
- For "question" intent: Explain what you need and why, offer examples
- For "skip" intent${stepConfig.canSkip ? ': Confirm you\'ll proceed without this info' : ': Politely explain this info is needed and ask again'}
- For "unclear" intent: Ask a clarifying question to get back on track
- For "answer" intent: Extract the actual value they provided
- Keep responses concise (1-2 sentences max)

JSON only, no markdown:`;
}

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

  const { message, step, propertyName, propertyType, question } = parsed.data;
  const stepConfig = stepConfigs[step];

  // If no step config, treat as direct answer (for steps without AI processing)
  if (!stepConfig) {
    return c.json({
      action: 'proceed',
      message: null,
      data: { value: message },
    });
  }

  // Get AI provider
  const registry = getAppRegistry();
  const aiProvider = registry.getActiveAIProvider();

  if (!aiProvider) {
    log.warn('No AI provider available for message processing, falling back to direct processing');
    // Fallback: try validation if available, otherwise proceed
    if (stepConfig.validation) {
      const result = stepConfig.validation(message);
      if (result.valid) {
        return c.json({
          action: 'proceed',
          message: null,
          data: { value: result.normalized || message },
        });
      } else {
        return c.json({
          action: 'retry',
          message: result.error || 'Please try again with a valid value.',
          data: null,
        });
      }
    }
    return c.json({
      action: 'proceed',
      message: null,
      data: { value: message },
    });
  }

  try {
    const prompt = buildProcessMessagePrompt(
      message,
      step,
      stepConfig,
      propertyName,
      propertyType,
      question
    );

    const response = await aiProvider.complete({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 500,
      temperature: 0.3,
    });

    // Parse JSON response
    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      log.warn('Failed to parse AI response, falling back');
      return c.json({
        action: 'proceed',
        message: null,
        data: { value: message },
      });
    }

    const aiResult = JSON.parse(jsonMatch[0]) as {
      intent: 'answer' | 'question' | 'skip' | 'unclear';
      response: string;
      extractedValue?: string;
    };

    log.info({ step, intent: aiResult.intent }, 'Processed setup message');

    // Map AI intent to frontend action
    switch (aiResult.intent) {
      case 'answer': {
        const value = aiResult.extractedValue || message;

        // Run validation if available
        if (stepConfig.validation) {
          const validationResult = stepConfig.validation(value);
          if (!validationResult.valid) {
            return c.json({
              action: 'retry',
              message: aiResult.response || validationResult.error || 'Please check your input and try again.',
              data: null,
            });
          }
          return c.json({
            action: 'proceed',
            message: aiResult.response || null,
            data: { value: validationResult.normalized || value },
          });
        }

        return c.json({
          action: 'proceed',
          message: aiResult.response || null,
          data: { value },
        });
      }

      case 'question':
        return c.json({
          action: 'show_message',
          message: aiResult.response,
          data: null,
          stayOnStep: true,
        });

      case 'skip':
        if (stepConfig.canSkip) {
          return c.json({
            action: 'skip',
            message: aiResult.response,
            data: null,
            nextStep: stepConfig.skipNextStep || null,
          });
        } else {
          // Can't skip this step
          return c.json({
            action: 'show_message',
            message: aiResult.response,
            data: null,
            stayOnStep: true,
          });
        }

      case 'unclear':
      default:
        return c.json({
          action: 'show_message',
          message: aiResult.response,
          data: null,
          stayOnStep: true,
        });
    }
  } catch (error) {
    log.error({ error, step }, 'Failed to process message with AI');

    // Fallback: try direct validation or proceed
    if (stepConfig.validation) {
      const result = stepConfig.validation(message);
      if (result.valid) {
        return c.json({
          action: 'proceed',
          message: null,
          data: { value: result.normalized || message },
        });
      }
    }

    return c.json({
      action: 'retry',
      message: 'I had trouble understanding that. Could you try again?',
      data: null,
    });
  }
});

export { setup as setupRoutes };
