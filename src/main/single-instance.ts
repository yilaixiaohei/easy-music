import { mkdirSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';

interface InstanceApp {
  getPath(name: 'userData'): string;
  setPath(name: 'userData', value: string): void;
  requestSingleInstanceLock(): boolean;
  on(event: 'second-instance' | 'before-quit', listener: () => void): unknown;
  exit(code: number): void;
}

export function canonicalDataDirectory(directory: string, platform = process.platform): string {
  mkdirSync(directory, { recursive: true });
  const physical = realpathSync.native(resolve(directory));
  // Windows paths are case-insensitive; junctions and alternate casing must not
  // let two processes share the same data directory with different lock names.
  return platform === 'win32' ? physical.toLowerCase() : physical;
}

export function acquireDataInstance(app: InstanceApp, activate: () => void) {
  // Electron keys its native process singleton by userData. The portable paths
  // must already be configured before requesting this lock.
  app.setPath('userData', canonicalDataDirectory(app.getPath('userData')));
  const primary = app.requestSingleInstanceLock();
  let ready = false;
  let pending = false;
  let quitting = false;
  if (!primary) {
    app.exit(0);
    return { primary: false, ready() {} };
  }
  app.on('before-quit', () => { quitting = true; });
  app.on('second-instance', () => {
    if (quitting) return;
    if (ready) activate();
    else pending = true;
  });
  return {
    primary: true,
    ready() {
      if (ready || quitting) return;
      ready = true;
      if (pending) { pending = false; activate(); }
    },
  };
}
