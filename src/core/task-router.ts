/**
 * Task Router
 *
 * Automatically creates tasks from guest intents.
 * Routes service requests to appropriate departments.
 *
 * @see docs/06-roadmap/phase-10-2-task-router.md
 */

import { createLogger } from '@/utils/logger.js';
import { getIntentDefinition, type IntentDefinition } from '@/ai/intent/taxonomy.js';
import type { ClassificationResult } from '@/ai/intent/index.js';
import { getAutonomyEngine, mapTaskTypeToActionType, type GuestContext as AutonomyContext } from './autonomy.js';

const log = createLogger('core:task-router');

// ===================
// Types
// ===================

export type TaskPriority = 'urgent' | 'high' | 'standard' | 'low';
export type TaskSource = 'manual' | 'auto' | 'automation';

/**
 * Guest context for routing decisions
 */
export interface GuestContext {
  guestId: string;
  firstName: string;
  lastName: string;
  roomNumber?: string;
  loyaltyTier?: string;
  language?: string;
}

/**
 * Routing decision result
 */
export interface RoutingDecision {
  shouldCreateTask: boolean;
  department?: string;
  taskType?: string;
  priority: TaskPriority;
  description?: string;
  items?: string[];
  autoAssign?: boolean;
  /** Whether task creation requires staff approval based on autonomy settings */
  requiresApproval?: boolean;
}

/**
 * Task creation result from router
 */
export interface TaskCreationResult {
  taskId: string;
  department: string;
  priority: TaskPriority;
  description: string;
}

// ===================
// Helper Functions
// ===================

/**
 * Map intent type prefix to task type
 */
function getTaskType(intent: string): string {
  if (intent.startsWith('request.housekeeping')) return 'housekeeping';
  if (intent.startsWith('request.dnd')) return 'housekeeping';
  if (intent.startsWith('request.laundry')) return 'housekeeping';
  if (intent.startsWith('request.maintenance')) return 'maintenance';
  if (intent.startsWith('request.room_service')) return 'room_service';
  if (intent.startsWith('request.concierge')) return 'concierge';
  if (intent.startsWith('request.transport')) return 'concierge';
  if (intent.startsWith('request.special_occasion')) return 'concierge';
  if (intent.startsWith('request.reservation')) return 'concierge';
  if (intent.startsWith('request.checkin')) return 'concierge';
  if (intent.startsWith('request.checkout')) return 'concierge';
  if (intent.startsWith('request.wakeup')) return 'concierge';
  if (intent.startsWith('request.luggage')) return 'concierge';
  if (intent.startsWith('request.room_change')) return 'concierge';
  if (intent.startsWith('request.lost_found')) return 'concierge';
  if (intent.startsWith('request.security')) return 'concierge';
  if (intent.startsWith('request.noise')) return 'concierge';
  if (intent.startsWith('request.billing')) return 'concierge';
  if (intent.startsWith('feedback.complaint')) return 'other';
  if (intent.startsWith('emergency')) return 'other';
  return 'other';
}

/**
 * Generate task description from intent
 */
function generateDescription(_intent: string, definition: IntentDefinition): string {
  // Use the intent definition description as base
  return definition.description;
}

// ===================
// Task Router
// ===================

/**
 * Task Router for automatic task creation from guest intents
 */
export class TaskRouter {
  /**
   * Determine if a task should be created for this intent
   */
  shouldCreateTask(classification: ClassificationResult): boolean {
    // Don't create tasks for low-confidence classifications
    if (classification.confidence < 0.6) {
      log.debug(
        { intent: classification.intent, confidence: classification.confidence },
        'Skipping task creation - low confidence'
      );
      return false;
    }

    // Check if the intent requires action
    return classification.requiresAction;
  }

  /**
   * Route an intent to a department and determine task parameters
   */
  route(classification: ClassificationResult, context: GuestContext): RoutingDecision {
    const definition = getIntentDefinition(classification.intent);

    // If no definition found, don't create task
    if (!definition) {
      return {
        shouldCreateTask: false,
        priority: 'standard',
      };
    }

    // Don't create task if no department is assigned
    if (!definition.department) {
      log.debug(
        { intent: classification.intent },
        'Skipping task creation - no department assigned'
      );
      return {
        shouldCreateTask: false,
        priority: 'standard',
      };
    }

    // Use priority from intent definition
    const priority = definition.priority;

    // Get task type from intent
    const taskType = getTaskType(classification.intent);

    // Generate description
    const description = generateDescription(classification.intent, definition);

    // Check autonomy settings
    const actionType = mapTaskTypeToActionType(taskType);
    let requiresApproval = false;

    if (actionType) {
      const autonomyEngine = getAutonomyEngine();
      const autonomyContext: AutonomyContext = {
        guestId: context.guestId,
        loyaltyTier: context.loyaltyTier ?? undefined,
      };
      requiresApproval = !autonomyEngine.canAutoExecute(actionType, autonomyContext);
    }

    log.info(
      {
        intent: classification.intent,
        department: definition.department,
        priority,
        guestId: context.guestId,
        requiresApproval,
      },
      'Routing decision made'
    );

    return {
      shouldCreateTask: true,
      department: definition.department,
      taskType,
      priority,
      description,
      autoAssign: false, // Future: could auto-assign based on availability
      requiresApproval,
    };
  }

  /**
   * Process a classification and return routing decision
   * This is the main entry point for the router
   */
  process(classification: ClassificationResult, context: GuestContext): RoutingDecision {
    if (!this.shouldCreateTask(classification)) {
      return {
        shouldCreateTask: false,
        priority: 'standard',
      };
    }

    return this.route(classification, context);
  }
}

// Singleton instance
let taskRouterInstance: TaskRouter | null = null;

/**
 * Get the TaskRouter singleton
 */
export function getTaskRouter(): TaskRouter {
  if (!taskRouterInstance) {
    taskRouterInstance = new TaskRouter();
    log.info('TaskRouter initialized');
  }
  return taskRouterInstance;
}

/**
 * Reset the TaskRouter (for testing)
 */
export function resetTaskRouter(): void {
  taskRouterInstance = null;
}

export default TaskRouter;
