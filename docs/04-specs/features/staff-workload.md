# Staff Schedule & Workload Specification

This document defines the staff scheduling and workload management data model for Jack The Butler.

---

## Overview

Task routing requires understanding staff availability, skills, and current workload. This specification defines:
- Schedule data model
- Skill taxonomy
- Workload calculation
- Availability determination

---

## Staff Data Model

### Core Staff Entity

```typescript
interface Staff {
  id: string;                    // staff_xxx
  email: string;
  name: string;
  role: StaffRole;
  department: Department;
  status: StaffStatus;
  skills: StaffSkill[];
  schedule: WeeklySchedule;
  preferences: StaffPreferences;
  metadata: {
    hireDate: Date;
    languages: string[];
    certifications: string[];
  };
  createdAt: Date;
  updatedAt: Date;
}

type StaffRole =
  | 'admin'
  | 'manager'
  | 'supervisor'
  | 'front_desk'
  | 'concierge'
  | 'housekeeping'
  | 'maintenance'
  | 'food_beverage'
  | 'bellhop'
  | 'valet';

type Department =
  | 'front_office'
  | 'housekeeping'
  | 'maintenance'
  | 'food_beverage'
  | 'concierge'
  | 'security'
  | 'management';

type StaffStatus =
  | 'available'                  // Online and can accept tasks
  | 'busy'                       // Online but at capacity
  | 'away'                       // Temporarily unavailable
  | 'offline'                    // Not working
  | 'on_break';                  // Scheduled break
```

### Database Schema

```sql
CREATE TABLE staff (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  department TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'offline',
  skills JSON DEFAULT '[]',
  schedule JSON DEFAULT '{}',
  preferences JSON DEFAULT '{}',
  metadata JSON DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  last_activity_at TEXT
);

CREATE INDEX idx_staff_role ON staff(role);
CREATE INDEX idx_staff_department ON staff(department);
CREATE INDEX idx_staff_status ON staff(status);
```

---

## Schedule Model

### Weekly Schedule

```typescript
interface WeeklySchedule {
  timezone: string;              // IANA timezone (e.g., "America/New_York")
  shifts: DailyShift[];
  exceptions: ScheduleException[];
}

interface DailyShift {
  dayOfWeek: DayOfWeek;          // 0 = Sunday, 6 = Saturday
  startTime: string;             // HH:mm format (24-hour)
  endTime: string;               // HH:mm format
  breakStart?: string;           // Optional break
  breakEnd?: string;
}

type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

interface ScheduleException {
  id: string;
  type: 'time_off' | 'extra_shift' | 'modified_shift';
  date: string;                  // YYYY-MM-DD
  startTime?: string;            // For modified/extra shifts
  endTime?: string;
  reason?: string;
  approved: boolean;
  approvedBy?: string;
}
```

### Example Schedule

```json
{
  "timezone": "America/New_York",
  "shifts": [
    { "dayOfWeek": 1, "startTime": "08:00", "endTime": "16:00", "breakStart": "12:00", "breakEnd": "12:30" },
    { "dayOfWeek": 2, "startTime": "08:00", "endTime": "16:00", "breakStart": "12:00", "breakEnd": "12:30" },
    { "dayOfWeek": 3, "startTime": "08:00", "endTime": "16:00", "breakStart": "12:00", "breakEnd": "12:30" },
    { "dayOfWeek": 4, "startTime": "08:00", "endTime": "16:00", "breakStart": "12:00", "breakEnd": "12:30" },
    { "dayOfWeek": 5, "startTime": "08:00", "endTime": "16:00", "breakStart": "12:00", "breakEnd": "12:30" }
  ],
  "exceptions": [
    { "id": "exc_1", "type": "time_off", "date": "2024-01-20", "reason": "Personal day", "approved": true }
  ]
}
```

### Availability Check

```typescript
function isStaffScheduled(staff: Staff, at: Date = new Date()): boolean {
  const schedule = staff.schedule;
  const localTime = toTimezone(at, schedule.timezone);

  // Check exceptions first
  const dateStr = formatDate(localTime, 'yyyy-MM-dd');
  const exception = schedule.exceptions.find(e => e.date === dateStr);

  if (exception) {
    if (exception.type === 'time_off') {
      return false;
    }
    if (exception.type === 'extra_shift' || exception.type === 'modified_shift') {
      return isTimeInRange(localTime, exception.startTime!, exception.endTime!);
    }
  }

  // Check regular shift
  const dayOfWeek = localTime.getDay() as DayOfWeek;
  const shift = schedule.shifts.find(s => s.dayOfWeek === dayOfWeek);

  if (!shift) {
    return false;
  }

  // Check if within shift hours
  if (!isTimeInRange(localTime, shift.startTime, shift.endTime)) {
    return false;
  }

  // Check if on break
  if (shift.breakStart && shift.breakEnd) {
    if (isTimeInRange(localTime, shift.breakStart, shift.breakEnd)) {
      return false;
    }
  }

  return true;
}

function isTimeInRange(time: Date, start: string, end: string): boolean {
  const timeStr = formatDate(time, 'HH:mm');
  return timeStr >= start && timeStr < end;
}
```

---

## Skill Taxonomy

### Skill Categories

```typescript
interface StaffSkill {
  category: SkillCategory;
  skill: string;
  level: SkillLevel;
  certifiedAt?: Date;
  expiresAt?: Date;
}

type SkillCategory =
  | 'service'
  | 'technical'
  | 'language'
  | 'specialty';

type SkillLevel =
  | 'basic'                      // Can handle simple cases
  | 'intermediate'               // Can handle most cases
  | 'advanced'                   // Can handle complex cases
  | 'expert';                    // Can train others
```

### Skill Registry

```typescript
const SKILL_REGISTRY: Record<SkillCategory, string[]> = {
  service: [
    'guest_relations',
    'complaint_handling',
    'vip_service',
    'concierge_services',
    'reservation_management',
    'check_in_out',
    'billing_payments',
  ],

  technical: [
    'pms_opera',
    'pms_mews',
    'pos_systems',
    'phone_systems',
    'key_systems',
    'hvac_basic',
    'plumbing_basic',
    'electrical_basic',
  ],

  language: [
    'english',
    'spanish',
    'french',
    'german',
    'mandarin',
    'japanese',
    'arabic',
    'portuguese',
  ],

  specialty: [
    'sommelier',
    'spa_services',
    'fitness_training',
    'event_planning',
    'tour_guiding',
    'childcare',
    'pet_services',
    'accessibility',
  ],
};
```

### Skill Matching

```typescript
interface SkillRequirement {
  skill: string;
  minLevel?: SkillLevel;
  required: boolean;
}

function matchesSkillRequirements(
  staff: Staff,
  requirements: SkillRequirement[]
): { matches: boolean; score: number } {
  let score = 0;
  let requiredMet = true;

  for (const req of requirements) {
    const staffSkill = staff.skills.find(s => s.skill === req.skill);

    if (!staffSkill) {
      if (req.required) {
        requiredMet = false;
      }
      continue;
    }

    // Check level
    const levels: SkillLevel[] = ['basic', 'intermediate', 'advanced', 'expert'];
    const minLevelIndex = req.minLevel ? levels.indexOf(req.minLevel) : 0;
    const staffLevelIndex = levels.indexOf(staffSkill.level);

    if (staffLevelIndex < minLevelIndex) {
      if (req.required) {
        requiredMet = false;
      }
      continue;
    }

    // Add to score (higher level = higher score)
    score += staffLevelIndex + 1;
  }

  return {
    matches: requiredMet,
    score,
  };
}
```

---

## Workload Calculation

### Workload Metrics

```typescript
interface StaffWorkload {
  staffId: string;
  timestamp: Date;
  metrics: {
    activeConversations: number;
    activeTasks: number;
    pendingTasks: number;
    completedToday: number;
    avgResponseTime: number;     // Minutes
    avgTaskDuration: number;     // Minutes
  };
  capacity: {
    maxConversations: number;
    maxConcurrentTasks: number;
    utilizationPercent: number;
  };
}
```

### Workload Calculation

```typescript
async function calculateWorkload(staffId: string): Promise<StaffWorkload> {
  const now = new Date();
  const todayStart = startOfDay(now);

  // Active conversations
  const activeConversations = await db.prepare(`
    SELECT COUNT(*) as count FROM conversations
    WHERE assigned_to = ? AND status IN ('active', 'escalated')
  `).get(staffId);

  // Active and pending tasks
  const tasks = await db.prepare(`
    SELECT status, COUNT(*) as count FROM tasks
    WHERE assigned_to = ? AND status IN ('pending', 'in_progress')
    GROUP BY status
  `).all(staffId);

  const activeTasks = tasks.find(t => t.status === 'in_progress')?.count || 0;
  const pendingTasks = tasks.find(t => t.status === 'pending')?.count || 0;

  // Completed today
  const completedToday = await db.prepare(`
    SELECT COUNT(*) as count FROM tasks
    WHERE assigned_to = ?
    AND status = 'completed'
    AND completed_at >= ?
  `).get(staffId, todayStart.toISOString());

  // Average response time (last 24 hours)
  const avgResponse = await db.prepare(`
    SELECT AVG(
      (julianday(first_response_at) - julianday(created_at)) * 24 * 60
    ) as avg_minutes
    FROM conversations
    WHERE assigned_to = ?
    AND first_response_at IS NOT NULL
    AND created_at >= datetime('now', '-1 day')
  `).get(staffId);

  // Staff capacity settings
  const staff = await db.staff.findById(staffId);
  const maxConversations = staff.preferences?.maxConversations || 5;
  const maxConcurrentTasks = staff.preferences?.maxConcurrentTasks || 3;

  // Calculate utilization
  const conversationUtilization = activeConversations.count / maxConversations;
  const taskUtilization = activeTasks / maxConcurrentTasks;
  const utilizationPercent = Math.max(conversationUtilization, taskUtilization) * 100;

  return {
    staffId,
    timestamp: now,
    metrics: {
      activeConversations: activeConversations.count,
      activeTasks,
      pendingTasks,
      completedToday: completedToday.count,
      avgResponseTime: avgResponse.avg_minutes || 0,
      avgTaskDuration: 0, // Calculate similarly
    },
    capacity: {
      maxConversations,
      maxConcurrentTasks,
      utilizationPercent,
    },
  };
}
```

### Availability Status

```typescript
type AvailabilityStatus =
  | 'available'                  // Can accept new work
  | 'limited'                    // Near capacity
  | 'at_capacity'                // Cannot accept more
  | 'unavailable';               // Not working/offline

async function getAvailabilityStatus(staffId: string): Promise<AvailabilityStatus> {
  const staff = await db.staff.findById(staffId);

  // Check if online
  if (staff.status === 'offline') {
    return 'unavailable';
  }

  // Check if scheduled
  if (!isStaffScheduled(staff)) {
    return 'unavailable';
  }

  // Check if on break or away
  if (staff.status === 'on_break' || staff.status === 'away') {
    return 'unavailable';
  }

  // Check workload
  const workload = await calculateWorkload(staffId);

  if (workload.capacity.utilizationPercent >= 100) {
    return 'at_capacity';
  }

  if (workload.capacity.utilizationPercent >= 80) {
    return 'limited';
  }

  return 'available';
}
```

---

## Staff Preferences

```typescript
interface StaffPreferences {
  // Capacity
  maxConversations: number;      // Default: 5
  maxConcurrentTasks: number;    // Default: 3

  // Notifications
  notifyOnAssignment: boolean;
  notifyOnEscalation: boolean;
  notifyOnMention: boolean;
  notificationSound: boolean;

  // UI preferences
  theme: 'light' | 'dark' | 'system';
  language: string;
  timezone?: string;             // Override from schedule

  // Auto-assignment
  autoAcceptTasks: boolean;      // Auto-accept assigned tasks
  taskCategories: string[];      // Preferred task types

  // Availability
  showOnlineStatus: boolean;
  autoAway: {
    enabled: boolean;
    afterMinutes: number;        // Go away after inactivity
  };
}
```

---

## Task Routing Integration

### Finding Available Staff

```typescript
interface StaffSearchCriteria {
  department?: Department;
  roles?: StaffRole[];
  skills?: SkillRequirement[];
  languages?: string[];
  excludeIds?: string[];
  maxWorkload?: number;          // Max utilization percent
}

async function findAvailableStaff(
  criteria: StaffSearchCriteria
): Promise<StaffWithScore[]> {
  // Get all staff matching basic criteria
  let query = db.staff.select();

  if (criteria.department) {
    query = query.where('department', criteria.department);
  }

  if (criteria.roles) {
    query = query.whereIn('role', criteria.roles);
  }

  if (criteria.excludeIds) {
    query = query.whereNotIn('id', criteria.excludeIds);
  }

  const candidates = await query.all();

  // Score each candidate
  const scored: StaffWithScore[] = [];

  for (const staff of candidates) {
    // Check availability
    const availability = await getAvailabilityStatus(staff.id);
    if (availability === 'unavailable' || availability === 'at_capacity') {
      continue;
    }

    // Check skills
    if (criteria.skills) {
      const skillMatch = matchesSkillRequirements(staff, criteria.skills);
      if (!skillMatch.matches) {
        continue;
      }
    }

    // Check languages
    if (criteria.languages) {
      const hasLanguage = criteria.languages.some(lang =>
        staff.skills.some(s => s.category === 'language' && s.skill === lang)
      );
      if (!hasLanguage) {
        continue;
      }
    }

    // Calculate score
    const workload = await calculateWorkload(staff.id);
    if (criteria.maxWorkload && workload.capacity.utilizationPercent > criteria.maxWorkload) {
      continue;
    }

    const score = calculateRoutingScore(staff, workload, criteria);
    scored.push({ staff, score, workload, availability });
  }

  // Sort by score (higher is better)
  return scored.sort((a, b) => b.score - a.score);
}

function calculateRoutingScore(
  staff: Staff,
  workload: StaffWorkload,
  criteria: StaffSearchCriteria
): number {
  let score = 100;

  // Penalize high workload
  score -= workload.capacity.utilizationPercent * 0.5;

  // Bonus for skill match
  if (criteria.skills) {
    const { score: skillScore } = matchesSkillRequirements(staff, criteria.skills);
    score += skillScore * 5;
  }

  // Bonus for fast response time
  if (workload.metrics.avgResponseTime < 5) {
    score += 10;
  }

  // Bonus for limited availability (prefer spreading load)
  if (workload.capacity.utilizationPercent < 50) {
    score += 10;
  }

  return score;
}

interface StaffWithScore {
  staff: Staff;
  score: number;
  workload: StaffWorkload;
  availability: AvailabilityStatus;
}
```

---

## Configuration

```yaml
staffing:
  # Workload defaults
  workload:
    defaultMaxConversations: 5
    defaultMaxConcurrentTasks: 3
    capacityWarningThreshold: 80   # Percent

  # Routing
  routing:
    preferLowerWorkload: true
    skillMatchBonus: 5
    responseTimeBonus: 10

  # Status
  autoAway:
    enabled: true
    afterMinutes: 30

  # Refresh intervals
  refresh:
    workloadCacheSeconds: 30
    availabilityCacheSeconds: 10
```

---

## Related

- [Task Routing](task-routing.md) - Task assignment logic
- [Database Schema](../database/schema.ts) - Staff table
- [Authentication](../api/authentication.md) - Staff login
