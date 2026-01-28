/**
 * Task Service
 *
 * Manages service requests and work orders.
 */

import { eq, and, desc, sql } from 'drizzle-orm';
import { db, tasks, staff, conversations } from '@/db/index.js';
import type { Task } from '@/db/schema.js';
import { generateId } from '@/utils/id.js';
import { createLogger } from '@/utils/logger.js';
import { NotFoundError } from '@/errors/index.js';

const log = createLogger('task');

export type TaskStatus = 'pending' | 'assigned' | 'in_progress' | 'completed' | 'cancelled';
export type TaskPriority = 'urgent' | 'high' | 'standard' | 'low';
export type TaskType = 'housekeeping' | 'maintenance' | 'concierge' | 'room_service' | 'other';

export interface CreateTaskInput {
  conversationId?: string;
  type: TaskType;
  department: string;
  roomNumber?: string;
  description: string;
  items?: string[];
  priority?: TaskPriority;
  dueAt?: string;
}

export interface UpdateTaskInput {
  status?: TaskStatus;
  assignedTo?: string | null;
  priority?: TaskPriority;
  notes?: string;
  completionNotes?: string;
}

export interface ListTasksOptions {
  status?: TaskStatus;
  department?: string;
  assignedTo?: string;
  limit?: number;
  offset?: number;
}

export interface TaskSummary {
  id: string;
  type: string;
  department: string;
  roomNumber: string | null;
  description: string;
  priority: string;
  status: string;
  assignedTo: string | null;
  assignedName?: string;
  dueAt: string | null;
  createdAt: string;
}

export class TaskService {
  /**
   * Create a new task
   */
  async create(input: CreateTaskInput): Promise<Task> {
    const id = generateId('task');
    const now = new Date().toISOString();

    await db.insert(tasks).values({
      id,
      conversationId: input.conversationId ?? null,
      type: input.type,
      department: input.department,
      roomNumber: input.roomNumber ?? null,
      description: input.description,
      items: input.items ? JSON.stringify(input.items) : null,
      priority: input.priority ?? 'standard',
      status: 'pending',
      dueAt: input.dueAt ?? null,
      createdAt: now,
      updatedAt: now,
    });

    log.info({ taskId: id, type: input.type, department: input.department }, 'Task created');

    return this.getById(id);
  }

  /**
   * Get task by ID
   */
  async getById(id: string): Promise<Task> {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
    if (!task) {
      throw new NotFoundError('Task', id);
    }
    return task;
  }

  /**
   * List tasks with optional filters
   */
  async list(options: ListTasksOptions = {}): Promise<TaskSummary[]> {
    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;

    const conditions = [];
    if (options.status) {
      conditions.push(eq(tasks.status, options.status));
    }
    if (options.department) {
      conditions.push(eq(tasks.department, options.department));
    }
    if (options.assignedTo) {
      conditions.push(eq(tasks.assignedTo, options.assignedTo));
    }

    let query = db
      .select({
        id: tasks.id,
        type: tasks.type,
        department: tasks.department,
        roomNumber: tasks.roomNumber,
        description: tasks.description,
        priority: tasks.priority,
        status: tasks.status,
        assignedTo: tasks.assignedTo,
        dueAt: tasks.dueAt,
        createdAt: tasks.createdAt,
      })
      .from(tasks)
      .orderBy(desc(tasks.createdAt))
      .limit(limit)
      .offset(offset);

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    const results = await query;

    // Get assigned staff names
    const assignedIds = results.filter((t) => t.assignedTo).map((t) => t.assignedTo!);
    const staffMap = new Map<string, string>();

    if (assignedIds.length > 0) {
      const staffList = await db
        .select({ id: staff.id, name: staff.name })
        .from(staff)
        .where(sql`${staff.id} IN (${sql.join(assignedIds.map(id => sql`${id}`), sql`, `)})`);

      for (const s of staffList) {
        staffMap.set(s.id, s.name);
      }
    }

    return results.map((t) => ({
      ...t,
      assignedName: t.assignedTo ? staffMap.get(t.assignedTo) : undefined,
    }));
  }

  /**
   * Update a task
   */
  async update(id: string, input: UpdateTaskInput): Promise<Task> {
    await this.getById(id); // Verify exists

    const updates: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };

    if (input.status !== undefined) {
      updates.status = input.status;
      if (input.status === 'in_progress' && !updates.startedAt) {
        updates.startedAt = new Date().toISOString();
      }
      if (input.status === 'completed') {
        updates.completedAt = new Date().toISOString();
      }
    }

    if (input.assignedTo !== undefined) {
      updates.assignedTo = input.assignedTo;
      if (input.assignedTo && input.status === undefined) {
        updates.status = 'assigned';
      }
    }

    if (input.priority !== undefined) {
      updates.priority = input.priority;
    }

    if (input.notes !== undefined) {
      updates.notes = input.notes;
    }

    if (input.completionNotes !== undefined) {
      updates.completionNotes = input.completionNotes;
    }

    await db.update(tasks).set(updates).where(eq(tasks.id, id));

    log.info({ taskId: id, updates }, 'Task updated');

    return this.getById(id);
  }

  /**
   * Claim a task (assign to self)
   */
  async claim(id: string, staffId: string): Promise<Task> {
    return this.update(id, {
      assignedTo: staffId,
      status: 'in_progress',
    });
  }

  /**
   * Complete a task
   */
  async complete(id: string, notes?: string): Promise<Task> {
    return this.update(id, {
      status: 'completed',
      completionNotes: notes,
    });
  }
}

export const taskService = new TaskService();
