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
import { adminRouter } from './admin.js';
import { appRoutes } from './apps.js';
import { automationRoutes } from './automation.js';
import { autonomySettingsRoutes, approvalsRoutes } from './autonomy.js';
import { hotelProfileRoutes } from './hotel-profile.js';
import { knowledgeRoutes } from './knowledge.js';
import { guestRoutes } from './guests.js';
import { reservationRoutes } from './reservations.js';
import { siteScraperRoutes } from '@/apps/tools/site-scraper/routes.js';
import { systemRoutes } from './system.js';
import { seedRoutes } from './seed.js';
import { rolesRouter, permissionsRouter } from './roles.js';
import { staffRouter } from './staff.js';

const api = new Hono();

// Authentication routes
api.route('/auth', authRoutes);

// Conversation routes
api.route('/conversations', conversationsRouter);

// Task routes
api.route('/tasks', tasksRouter);

// Admin routes
api.route('/admin', adminRouter);

// App management routes
api.route('/apps', appRoutes);

// Automation management routes
api.route('/automation', automationRoutes);

// Autonomy settings routes
api.route('/settings/autonomy', autonomySettingsRoutes);

// Hotel profile settings routes
api.route('/settings/hotel', hotelProfileRoutes);

// Approval queue routes
api.route('/approvals', approvalsRoutes);

// Knowledge base routes
api.route('/knowledge', knowledgeRoutes);

// Guest routes
api.route('/guests', guestRoutes);

// Reservation routes
api.route('/reservations', reservationRoutes);

// Tool routes
api.route('/tools/site-scraper', siteScraperRoutes);

// System status routes
api.route('/system', systemRoutes);

// Seed/demo data routes
api.route('/seed', seedRoutes);

// Role management routes
api.route('/roles', rolesRouter);

// Permissions routes
api.route('/permissions', permissionsRouter);

// Staff management routes
api.route('/staff', staffRouter);

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
