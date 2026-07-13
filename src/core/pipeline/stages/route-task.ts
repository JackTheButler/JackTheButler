/**
 * routeTask — Butler-side stage. Creates a row in the `tasks` table when
 * the classified intent calls for staff action (e.g. a housekeeping
 * request, a maintenance report). Runs after `checkVerification` so the
 * just-verified entity is available for room-number lookup.
 *
 * Triggers when **all** of:
 *   - `ctx.classification.confidence >= 0.6`
 *   - `intent.metadata.requiresAction === true`
 *   - `intent.metadata.department` is set
 *   - if `intent.metadata.requiresIdentity` is true, `ctx.entity` exists
 *
 * Sets `ctx.taskCreated` + `ctx.taskId` on `ButlerContext`. `taskService`
 * itself emits `TASK_CREATED`; the activity-log + dashboard WebSocket
 * subscribers pick it up.
 *
 * Minimal port — no autonomy gating, no AI-extracted items. Every task
 * lands in the queue as `status: 'pending'` for staff to claim.
 *
 * @module core/pipeline/stages/route-task
 */

import { taskService, type TaskType } from '@/services/task.js';
import type { Stage } from '@thebutler/pipeline';
import type { TaskPriority } from '@jackthebutler/shared';
import type { ButlerContext } from '../context.js';
import type { HospitalityEntity } from '../entity-resolver.js';

const MIN_CONFIDENCE = 0.6;

interface IntentRoutingMetadata {
  department?: string;
  requiresAction?: boolean;
  requiresIdentity?: boolean;
  priority?: TaskPriority;
}

const TASK_TYPE_DEPARTMENTS: ReadonlySet<TaskType> = new Set([
  'housekeeping',
  'maintenance',
  'concierge',
  'room_service',
]);

/**
 * Map a department string onto the `tasks.type` enum. Departments that
 * don't match one of the four canonical task types (e.g. `'front_desk'`)
 * fall through to `'other'`.
 */
function departmentToType(department: string): TaskType {
  return TASK_TYPE_DEPARTMENTS.has(department as TaskType)
    ? (department as TaskType)
    : 'other';
}

export const routeTask: Stage<ButlerContext> = async (ctx, env) => {
  if (!ctx.conversation || !ctx.classification) return;
  if (ctx.classification.confidence < MIN_CONFIDENCE) return;

  const intent = env.intents.get(ctx.classification.intent);
  if (!intent) return;

  const meta = (intent.metadata ?? {}) as IntentRoutingMetadata;
  if (!meta.requiresAction || !meta.department) return;

  // If this intent demands identity (e.g. fulfilling a housekeeping
  // request needs a room number), skip when the guest hasn't been
  // identified yet — the responder prompts for verification on this
  // turn; the task will be created on a subsequent turn once they are.
  if (meta.requiresIdentity && !ctx.entity) return;

  const entity = ctx.entity as HospitalityEntity | null;

  const task = await taskService.create({
    ...(ctx.conversation ? { conversationId: ctx.conversation.id } : {}),
    ...(ctx.savedInboundId ? { messageId: ctx.savedInboundId } : {}),
    source: 'auto',
    type: departmentToType(meta.department),
    department: meta.department,
    ...(entity?.reservation?.roomNumber
      ? { roomNumber: entity.reservation.roomNumber }
      : {}),
    description: intent.description,
    priority: meta.priority ?? 'standard',
  });

  ctx.taskCreated = true;
  ctx.taskId = task.id;
};
