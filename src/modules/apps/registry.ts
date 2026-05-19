import type { AppModule } from '@janetheoperator/shared/contracts';
import { stubModule } from '@janetheoperator/app-stub';

/**
 * The only place the core references integration packages. Adding an app =
 * new package + one line here (same principle as route mounting in app.ts).
 */
export const appModules: AppModule[] = [stubModule];

export function findModule(id: string): AppModule | undefined {
  return appModules.find((m) => m.manifest.id === id);
}
