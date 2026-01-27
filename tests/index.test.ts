/**
 * Phase 0 - Basic test to verify test infrastructure works
 */

import { describe, it, expect } from 'vitest';

describe('Phase 0: Test Infrastructure', () => {
  it('should run tests', () => {
    expect(true).toBe(true);
  });

  it('should have correct Node.js version', () => {
    const [major] = process.version.slice(1).split('.').map(Number);
    expect(major).toBeGreaterThanOrEqual(22);
  });

  it('should have TypeScript working', () => {
    const value: string = 'Jack The Butler';
    expect(value).toBe('Jack The Butler');
  });
});
