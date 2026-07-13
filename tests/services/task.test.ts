/**
 * Task Service Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db, tasks, staff, conversations, messages } from '@/db/index.js';
import { eq } from 'drizzle-orm';
import { TaskService } from '@/services/task.js';
import { authService } from '@/auth/index.js';
import { SYSTEM_ROLE_IDS } from '@/permissions/defaults.js';
import { events } from '@/events/index.js';

describe('TaskService', () => {
  let service: TaskService;
  const testStaffId = 'staff-task-svc-1';

  beforeEach(async () => {
    service = new TaskService();
    await db.delete(tasks);
    await db.delete(staff).where(eq(staff.id, testStaffId));

    const passwordHash = await authService.hashPassword('password123');
    await db.insert(staff).values({
      id: testStaffId,
      email: 'task-svc-staff@test.com',
      name: 'Task Staff',
      roleId: SYSTEM_ROLE_IDS.STAFF,
      status: 'active',
      passwordHash,
    });
  });

  afterEach(async () => {
    await db.delete(tasks);
    await db.delete(staff).where(eq(staff.id, testStaffId));
    vi.restoreAllMocks();
  });

  describe('create', () => {
    it('should create a task with default source/priority/status', async () => {
      const task = await service.create({
        type: 'housekeeping',
        department: 'housekeeping',
        description: 'Clean room 101',
      });

      expect(task.source).toBe('manual');
      expect(task.priority).toBe('standard');
      expect(task.status).toBe('pending');
      expect(task.type).toBe('housekeeping');
      expect(task.department).toBe('housekeeping');
      expect(task.description).toBe('Clean room 101');
      expect(task.conversationId).toBeNull();
      expect(task.roomNumber).toBeNull();
    });

    it('should create a task with explicit fields', async () => {
      // tasks.conversationId/messageId are FK columns, so referenced rows must exist first.
      await db.insert(conversations).values({
        id: 'conv-1',
        channelType: 'webchat',
        channelId: 'session-conv-1',
      });
      await db.insert(messages).values({
        id: 'msg-1',
        conversationId: 'conv-1',
        direction: 'inbound',
        senderType: 'guest',
        content: 'Please fix the AC',
      });

      const task = await service.create({
        conversationId: 'conv-1',
        messageId: 'msg-1',
        source: 'auto',
        type: 'maintenance',
        department: 'maintenance',
        roomNumber: '202',
        description: 'Fix AC',
        priority: 'urgent',
        dueAt: '2099-01-01T00:00:00.000Z',
      });

      expect(task.conversationId).toBe('conv-1');
      expect(task.messageId).toBe('msg-1');
      expect(task.source).toBe('auto');
      expect(task.roomNumber).toBe('202');
      expect(task.priority).toBe('urgent');
      expect(task.dueAt).toBe('2099-01-01T00:00:00.000Z');

      // Clear the task first — it FK-references conv-1/msg-1, so those must be deleted after it.
      await db.delete(tasks).where(eq(tasks.id, task.id));
      await db.delete(messages).where(eq(messages.id, 'msg-1'));
      await db.delete(conversations).where(eq(conversations.id, 'conv-1'));
    });

    it('should emit a TASK_CREATED event', async () => {
      const emitSpy = vi.spyOn(events, 'emit');

      const task = await service.create({
        type: 'concierge',
        department: 'concierge',
        description: 'Book a table',
      });

      expect(emitSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'task.created',
          taskId: task.id,
          department: 'concierge',
          priority: 'standard',
        })
      );
    });

    it('should include conversationId in emitted event only when provided', async () => {
      const emitSpy = vi.spyOn(events, 'emit');

      await service.create({
        type: 'other',
        department: 'front_desk',
        description: 'No conversation here',
      });

      const call = emitSpy.mock.calls.at(-1)?.[0] as Record<string, unknown>;
      expect(call).not.toHaveProperty('conversationId');
    });
  });

  describe('getById', () => {
    it('should return a task by id', async () => {
      const created = await service.create({
        type: 'room_service',
        department: 'kitchen',
        description: 'Bring towels',
      });

      const found = await service.getById(created.id);
      expect(found.id).toBe(created.id);
    });

    it('should throw NotFoundError for a missing task', async () => {
      await expect(service.getById('nonexistent-task')).rejects.toThrow('not found');
    });
  });

  describe('list', () => {
    beforeEach(async () => {
      await service.create({
        type: 'housekeeping',
        department: 'housekeeping',
        description: 'Task A',
        roomNumber: '101',
      });
      await service.create({
        type: 'maintenance',
        department: 'maintenance',
        description: 'Task B',
        source: 'auto',
      });
      const assigned = await service.create({
        type: 'concierge',
        department: 'concierge',
        description: 'Task C',
      });
      await service.update(assigned.id, { assignedTo: testStaffId });
    });

    it('should list all tasks by default, most recent first', async () => {
      const results = await service.list();
      expect(results.length).toBe(3);
    });

    it('should filter by department', async () => {
      const results = await service.list({ department: 'housekeeping' });
      expect(results).toHaveLength(1);
      expect(results[0]?.description).toBe('Task A');
    });

    it('should filter by source', async () => {
      const results = await service.list({ source: 'auto' });
      expect(results).toHaveLength(1);
      expect(results[0]?.description).toBe('Task B');
    });

    it('should filter by status', async () => {
      const results = await service.list({ status: 'pending' });
      expect(results.every((t) => t.status === 'pending')).toBe(true);
    });

    it('should filter by assignedTo and resolve assignedName', async () => {
      const results = await service.list({ assignedTo: testStaffId });
      expect(results).toHaveLength(1);
      expect(results[0]?.assignedName).toBe('Task Staff');
    });

    it('should respect limit', async () => {
      const results = await service.list({ limit: 1 });
      expect(results).toHaveLength(1);
    });

    it('should leave assignedName undefined for unassigned tasks', async () => {
      const results = await service.list({ department: 'housekeeping' });
      expect(results[0]?.assignedName).toBeUndefined();
    });
  });

  describe('update', () => {
    it('should throw NotFoundError when task does not exist', async () => {
      await expect(service.update('missing', { status: 'completed' })).rejects.toThrow(
        'not found'
      );
    });

    it('should set startedAt when status changes to in_progress', async () => {
      const task = await service.create({
        type: 'housekeeping',
        department: 'housekeeping',
        description: 'Task',
      });

      const updated = await service.update(task.id, { status: 'in_progress' });

      expect(updated.status).toBe('in_progress');
      expect(updated.startedAt).not.toBeNull();
    });

    it('should set completedAt and emit TASK_COMPLETED when status changes to completed', async () => {
      const task = await service.create({
        type: 'housekeeping',
        department: 'housekeeping',
        description: 'Task',
      });
      const emitSpy = vi.spyOn(events, 'emit');

      const updated = await service.update(task.id, { status: 'completed' });

      expect(updated.status).toBe('completed');
      expect(updated.completedAt).not.toBeNull();
      expect(emitSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'task.completed', taskId: task.id })
      );
    });

    it('should auto-set status to assigned when assignedTo given without explicit status', async () => {
      const task = await service.create({
        type: 'housekeeping',
        department: 'housekeeping',
        description: 'Task',
      });

      const updated = await service.update(task.id, { assignedTo: testStaffId });

      expect(updated.assignedTo).toBe(testStaffId);
      expect(updated.status).toBe('assigned');
    });

    it('should not override an explicit status when assignedTo is also given', async () => {
      const task = await service.create({
        type: 'housekeeping',
        department: 'housekeeping',
        description: 'Task',
      });

      const updated = await service.update(task.id, {
        assignedTo: testStaffId,
        status: 'in_progress',
      });

      expect(updated.assignedTo).toBe(testStaffId);
      expect(updated.status).toBe('in_progress');
    });

    it('should emit TASK_ASSIGNED when assignedTo is set to a non-null value', async () => {
      const task = await service.create({
        type: 'housekeeping',
        department: 'housekeeping',
        description: 'Task',
      });
      const emitSpy = vi.spyOn(events, 'emit');

      await service.update(task.id, { assignedTo: testStaffId });

      expect(emitSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'task.assigned',
          taskId: task.id,
          assignedTo: testStaffId,
        })
      );
    });

    it('should not emit TASK_ASSIGNED when assignedTo is explicitly cleared to null', async () => {
      const task = await service.create({
        type: 'housekeeping',
        department: 'housekeeping',
        description: 'Task',
      });
      await service.update(task.id, { assignedTo: testStaffId });

      const emitSpy = vi.spyOn(events, 'emit');
      await service.update(task.id, { assignedTo: null });

      expect(emitSpy).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'task.assigned' })
      );
    });

    it('should update priority, notes, and completionNotes independently', async () => {
      const task = await service.create({
        type: 'housekeeping',
        department: 'housekeeping',
        description: 'Task',
      });

      const updated = await service.update(task.id, {
        priority: 'urgent',
        notes: 'internal note',
        completionNotes: 'done well',
      });

      expect(updated.priority).toBe('urgent');
      expect(updated.notes).toBe('internal note');
      expect(updated.completionNotes).toBe('done well');
    });
  });

  describe('claim', () => {
    it('should assign the task to staff and set status to in_progress', async () => {
      const task = await service.create({
        type: 'housekeeping',
        department: 'housekeeping',
        description: 'Task',
      });

      const claimed = await service.claim(task.id, testStaffId);

      expect(claimed.assignedTo).toBe(testStaffId);
      expect(claimed.status).toBe('in_progress');
      expect(claimed.startedAt).not.toBeNull();
    });
  });

  describe('complete', () => {
    it('should mark task completed without notes', async () => {
      const task = await service.create({
        type: 'housekeeping',
        department: 'housekeeping',
        description: 'Task',
      });

      const completed = await service.complete(task.id);

      expect(completed.status).toBe('completed');
      expect(completed.completionNotes).toBeNull();
    });

    it('should mark task completed with notes', async () => {
      const task = await service.create({
        type: 'housekeeping',
        department: 'housekeeping',
        description: 'Task',
      });

      const completed = await service.complete(task.id, 'All good');

      expect(completed.status).toBe('completed');
      expect(completed.completionNotes).toBe('All good');
    });
  });

  describe('reopen', () => {
    it('should reopen a completed task back to pending and clear assignment', async () => {
      const task = await service.create({
        type: 'housekeeping',
        department: 'housekeeping',
        description: 'Task',
      });
      await service.claim(task.id, testStaffId);
      await service.complete(task.id, 'Done');

      const reopened = await service.reopen(task.id);

      expect(reopened.status).toBe('pending');
      expect(reopened.assignedTo).toBeNull();
      expect(reopened.completedAt).toBeNull();
    });

    it('should reopen a cancelled task', async () => {
      const task = await service.create({
        type: 'housekeeping',
        department: 'housekeeping',
        description: 'Task',
      });
      await service.update(task.id, { status: 'cancelled' });

      const reopened = await service.reopen(task.id);

      expect(reopened.status).toBe('pending');
    });

    it('should throw ConflictError when task is not completed or cancelled', async () => {
      const task = await service.create({
        type: 'housekeeping',
        department: 'housekeeping',
        description: 'Task',
      });

      await expect(service.reopen(task.id)).rejects.toThrow(
        'Only completed or cancelled tasks can be reopened'
      );
    });

    it('should throw NotFoundError for a missing task', async () => {
      await expect(service.reopen('missing-task')).rejects.toThrow('not found');
    });
  });

  describe('getStats', () => {
    it('should return correct counts by status', async () => {
      const t1 = await service.create({
        type: 'housekeeping',
        department: 'housekeeping',
        description: 'Task 1',
      });
      const t2 = await service.create({
        type: 'housekeeping',
        department: 'housekeeping',
        description: 'Task 2',
      });
      const t3 = await service.create({
        type: 'housekeeping',
        department: 'housekeeping',
        description: 'Task 3',
      });
      await service.update(t1.id, { status: 'in_progress' });
      await service.update(t2.id, { assignedTo: testStaffId }); // -> assigned
      await service.update(t3.id, { status: 'completed' });

      const stats = await service.getStats();

      expect(stats.total).toBe(3);
      expect(stats.completed).toBe(1);
      expect(stats.inProgress).toBe(2); // assigned + in_progress
      expect(stats.pending).toBe(0);
    });

    it('should return zeros when there are no tasks', async () => {
      const stats = await service.getStats();

      expect(stats).toEqual({ pending: 0, inProgress: 0, completed: 0, total: 0 });
    });
  });
});
