/**
 * API Routes
 *
 * Main API route aggregation. Individual resource routes
 * will be added in later phases.
 */

import { Hono } from 'hono';
import { authRoutes } from './auth.js';
import { conversationsRouter } from './conversations.js';
import { tasksRouter } from './tasks.js';

const api = new Hono();

// Authentication routes
api.route('/auth', authRoutes);

// Conversation routes
api.route('/conversations', conversationsRouter);

// Task routes
api.route('/tasks', tasksRouter);

/**
 * GET /api/v1
 * API info endpoint
 */
api.get('/', (c) => {
  return c.json({
    name: 'Jack The Butler API',
    version: 'v1',
    documentation: '/docs',
  });
});

export { api as apiRoutes };
