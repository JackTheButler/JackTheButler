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
  isVIP?: boolean;
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
// Priority Elevation
// ===================

/**
 * Elevate priority for VIP guests
 */
function elevatePriority(basePriority: TaskPriority, isVIP: boolean): TaskPriority {
  if (!isVIP) return basePriority;

  const priorityOrder: TaskPriority[] = ['low', 'standard', 'high', 'urgent'];
  const currentIndex = priorityOrder.indexOf(basePriority);

  // Elevate by one level (max is 'urgent')
  const newIndex = Math.min(currentIndex + 1, priorityOrder.length - 1);
  return priorityOrder[newIndex] ?? basePriority;
}

/**
 * Map intent type prefix to task type
 */
function getTaskType(intent: string): string {
  if (intent.startsWith('request.housekeeping')) return 'housekeeping';
  if (intent.startsWith('request.maintenance')) return 'maintenance';
  if (intent.startsWith('request.room_service')) return 'room_service';
  if (intent.startsWith('request.concierge')) return 'concierge';
  if (intent.startsWith('inquiry.reservation')) return 'concierge';
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

    // If no action required or no definition, don't create task
    if (!classification.requiresAction || !definition) {
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

    // Determine priority (elevate for VIP)
    const basePriority = definition.priority;
    const priority = elevatePriority(basePriority, context.isVIP ?? false);

    // Get task type from intent
    const taskType = getTaskType(classification.intent);

    // Generate description
    const description = generateDescription(classification.intent, definition);

    log.info(
      {
        intent: classification.intent,
        department: definition.department,
        priority,
        isVIP: context.isVIP,
        guestId: context.guestId,
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
