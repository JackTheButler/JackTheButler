import type { AppModule } from '@janetheoperator/shared/contracts';
import { webchatModule } from '@janetheoperator/channel-webchat';

/**
 * The only place the core references integration packages. Adding an app =
 * new package + one line in the default list (same principle as route
 * mounting in app.ts). Settable so tests can inject a fixture instead of
 * shipping a fake app at runtime.
 */
const DEFAULT_MODULES: AppModule[] = [webchatModule];

let modules: AppModule[] = DEFAULT_MODULES;

export function getAppModules(): AppModule[] {
  return modules;
}

/** Test seam — override the registered apps (e.g. with a stub fixture). */
export function setAppModules(next: AppModule[]): void {
  modules = next;
}

export function findModule(id: string): AppModule | undefined {
  return modules.find((m) => m.manifest.id === id);
}
