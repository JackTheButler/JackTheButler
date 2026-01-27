/**
 * Database Tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '@/db/schema.js';

describe('Database', () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle>;

  beforeAll(() => {
    // Use in-memory database for tests
    sqlite = new Database(':memory:');
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    db = drizzle(sqlite, { schema });

    // Create tables manually for in-memory database
    sqlite.exec(`
      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE guests (
        id TEXT PRIMARY KEY,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        language TEXT DEFAULT 'en',
        loyalty_tier TEXT,
        vip_status TEXT,
        external_ids TEXT NOT NULL DEFAULT '{}',
        preferences TEXT NOT NULL DEFAULT '[]',
        stay_count INTEGER NOT NULL DEFAULT 0,
        total_revenue REAL NOT NULL DEFAULT 0,
        last_stay_date TEXT,
        notes TEXT,
        tags TEXT DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE staff (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        phone TEXT,
        role TEXT NOT NULL,
        department TEXT,
        permissions TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'active',
        last_active_at TEXT,
        password_hash TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE reservations (
        id TEXT PRIMARY KEY,
        guest_id TEXT NOT NULL REFERENCES guests(id),
        confirmation_number TEXT NOT NULL UNIQUE,
        external_id TEXT,
        room_number TEXT,
        room_type TEXT NOT NULL,
        arrival_date TEXT NOT NULL,
        departure_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'confirmed',
        estimated_arrival TEXT,
        actual_arrival TEXT,
        estimated_departure TEXT,
        actual_departure TEXT,
        rate_code TEXT,
        total_rate REAL,
        balance REAL DEFAULT 0,
        special_requests TEXT DEFAULT '[]',
        notes TEXT DEFAULT '[]',
        synced_at TEXT NOT NULL DEFAULT (datetime('now')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE conversations (
        id TEXT PRIMARY KEY,
        guest_id TEXT REFERENCES guests(id),
        reservation_id TEXT REFERENCES reservations(id),
        channel_type TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'active',
        assigned_to TEXT REFERENCES staff(id),
        current_intent TEXT,
        metadata TEXT NOT NULL DEFAULT '{}',
        last_message_at TEXT,
        resolved_at TEXT,
        idle_warned_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES conversations(id),
        direction TEXT NOT NULL,
        sender_type TEXT NOT NULL,
        sender_id TEXT,
        content TEXT NOT NULL,
        content_type TEXT NOT NULL DEFAULT 'text',
        media TEXT,
        intent TEXT,
        confidence REAL,
        entities TEXT,
        channel_message_id TEXT,
        delivery_status TEXT DEFAULT 'sent',
        delivery_error TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        conversation_id TEXT REFERENCES conversations(id),
        type TEXT NOT NULL,
        department TEXT NOT NULL,
        room_number TEXT,
        description TEXT NOT NULL,
        items TEXT,
        priority TEXT NOT NULL DEFAULT 'standard',
        status TEXT NOT NULL DEFAULT 'pending',
        assigned_to TEXT REFERENCES staff(id),
        external_id TEXT,
        external_system TEXT,
        due_at TEXT,
        started_at TEXT,
        completed_at TEXT,
        notes TEXT,
        completion_notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  });

  afterAll(() => {
    sqlite.close();
  });

  describe('Schema', () => {
    it('should have settings table', () => {
      const result = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='settings'").get();
      expect(result).toBeDefined();
    });

    it('should have guests table', () => {
      const result = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='guests'").get();
      expect(result).toBeDefined();
    });

    it('should have reservations table', () => {
      const result = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='reservations'").get();
      expect(result).toBeDefined();
    });

    it('should have staff table', () => {
      const result = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='staff'").get();
      expect(result).toBeDefined();
    });

    it('should have conversations table', () => {
      const result = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='conversations'").get();
      expect(result).toBeDefined();
    });

    it('should have messages table', () => {
      const result = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='messages'").get();
      expect(result).toBeDefined();
    });

    it('should have tasks table', () => {
      const result = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'").get();
      expect(result).toBeDefined();
    });
  });

  describe('CRUD operations', () => {
    it('should insert and retrieve a setting', () => {
      sqlite.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('test_key', 'test_value');

      const result = sqlite.prepare('SELECT * FROM settings WHERE key = ?').get('test_key') as { key: string; value: string };

      expect(result.key).toBe('test_key');
      expect(result.value).toBe('test_value');
    });

    it('should insert and retrieve a guest', () => {
      sqlite.prepare('INSERT INTO guests (id, first_name, last_name, email) VALUES (?, ?, ?, ?)').run(
        'guest-1',
        'John',
        'Doe',
        'john@example.com'
      );

      const result = sqlite.prepare('SELECT * FROM guests WHERE id = ?').get('guest-1') as { id: string; first_name: string; last_name: string; email: string };

      expect(result.id).toBe('guest-1');
      expect(result.first_name).toBe('John');
      expect(result.last_name).toBe('Doe');
      expect(result.email).toBe('john@example.com');
    });

    it('should insert and retrieve staff', () => {
      sqlite.prepare('INSERT INTO staff (id, email, name, role) VALUES (?, ?, ?, ?)').run(
        'staff-1',
        'admin@hotel.com',
        'Admin User',
        'admin'
      );

      const result = sqlite.prepare('SELECT * FROM staff WHERE id = ?').get('staff-1') as { id: string; email: string; name: string; role: string };

      expect(result.id).toBe('staff-1');
      expect(result.email).toBe('admin@hotel.com');
      expect(result.name).toBe('Admin User');
      expect(result.role).toBe('admin');
    });

    it('should enforce foreign key constraints', () => {
      // Try to insert a reservation with non-existent guest
      expect(() => {
        sqlite.prepare('INSERT INTO reservations (id, guest_id, confirmation_number, room_type, arrival_date, departure_date) VALUES (?, ?, ?, ?, ?, ?)').run(
          'res-1',
          'non-existent-guest',
          'CONF123',
          'standard',
          '2024-01-01',
          '2024-01-05'
        );
      }).toThrow();
    });

    it('should allow valid foreign key references', () => {
      // Insert guest first
      sqlite.prepare('INSERT INTO guests (id, first_name, last_name) VALUES (?, ?, ?)').run('guest-2', 'Jane', 'Smith');

      // Then insert reservation
      sqlite.prepare('INSERT INTO reservations (id, guest_id, confirmation_number, room_type, arrival_date, departure_date) VALUES (?, ?, ?, ?, ?, ?)').run(
        'res-2',
        'guest-2',
        'CONF456',
        'suite',
        '2024-02-01',
        '2024-02-05'
      );

      const result = sqlite.prepare('SELECT * FROM reservations WHERE id = ?').get('res-2') as { id: string; guest_id: string; confirmation_number: string };

      expect(result.id).toBe('res-2');
      expect(result.guest_id).toBe('guest-2');
      expect(result.confirmation_number).toBe('CONF456');
    });
  });

  describe('WAL mode', () => {
    it('should attempt to set WAL mode (falls back to memory for in-memory db)', () => {
      // In-memory databases don't support WAL mode, but we verify the pragma call works
      const result = sqlite.pragma('journal_mode') as { journal_mode: string }[];
      // In-memory databases return 'memory' since WAL isn't supported
      // File-based databases would return 'wal'
      expect(['memory', 'wal']).toContain(result[0].journal_mode);
    });
  });
});
