import { describe, it, expect } from 'vitest';
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const MODULES = fileURLToPath(new URL('../src/modules', import.meta.url));

function moduleDirs(): string[] {
  return readdirSync(MODULES).filter((n) => statSync(join(MODULES, n)).isDirectory());
}

/** Structural guardrails: enforced at test time so they hold as the
 *  codebase grows, not just by review. */
describe('architecture', () => {
  it('every module has the required contract files (routes.ts + service.ts)', () => {
    for (const mod of moduleDirs()) {
      const files = readdirSync(join(MODULES, mod));
      expect(files, `module "${mod}" must have routes.ts`).toContain('routes.ts');
      expect(files, `module "${mod}" must have service.ts`).toContain('service.ts');
    }
  });

  it('service.ts files are transport-agnostic (must not import hono)', () => {
    for (const mod of moduleDirs()) {
      const svc = join(MODULES, mod, 'service.ts');
      const src = readFileSync(svc, 'utf8');
      expect(
        /from\s+['"]@?hono(['"/])/.test(src),
        `${mod}/service.ts must not import hono — keep business logic transport-agnostic`,
      ).toBe(false);
    }
  });
});
