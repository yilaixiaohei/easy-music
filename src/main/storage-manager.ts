import { lstat, readdir, unlink } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import type { CacheLimitMB, StorageCleanup, StorageInfo } from '../shared/contracts';

interface CacheSession { getCacheSize(): Promise<number>; clearCache(): Promise<void> }
interface StoragePaths { data: string; logs: string; crashes: string; temporary?: string }

function inside(root: string, target: string) {
  const part = relative(root, target);
  return part !== '' && !isAbsolute(part) && part !== '..' && !part.startsWith(`..${sep}`);
}

// Never follow junctions/symlinks or recursively remove directories. Only diagnostic
// files are unlinked; active/locked files are left for a later cleanup.
async function inspect(directory: string, removeFiles = false) {
  const root = resolve(directory);
  let bytes = 0, skipped = 0, visited = 0;
  async function walk(current: string): Promise<void> {
    if (++visited > 100000) { skipped++; return; }
    try {
      const stat = await lstat(current);
      if (stat.isSymbolicLink()) { skipped++; return; }
      if (stat.isDirectory()) {
        for (const name of await readdir(current)) {
          const target = resolve(current, name);
          if (inside(root, target)) await walk(target);
        }
      } else if (stat.isFile()) {
        bytes += stat.size;
        if (removeFiles && inside(root, current)) {
          try { await unlink(current); } catch { skipped++; }
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') skipped++;
    }
  }
  await walk(root);
  return { bytes, skipped };
}

export class StorageManager {
  private clearing: Promise<StorageCleanup> | undefined;
  constructor(private paths: StoragePaths, private session: CacheSession,
    private cacheLimits: () => { cacheLimitMB: CacheLimitMB; activeCacheLimitMB: CacheLimitMB } = () => ({ cacheLimitMB: 512, activeCacheLimitMB: 512 })) {
    const data = resolve(paths.data);
    for (const directory of [paths.logs, paths.crashes]) {
      const target = resolve(directory);
      if (target === data || inside(target, data)) throw new Error('诊断文件目录配置无效。');
    }
  }
  async info(): Promise<StorageInfo> {
    const [total, logs, crashes, temporary, cacheBytes] = await Promise.all([
      inspect(this.paths.data), inspect(this.paths.logs), inspect(this.paths.crashes),
      this.paths.temporary ? inspect(this.paths.temporary) : Promise.resolve(null),
      this.session.getCacheSize(),
    ]);
    return {
      ...this.cacheLimits(),
      directory: this.paths.data, totalBytes: total.bytes, cacheBytes,
      diagnosticBytes: logs.bytes + crashes.bytes, temporaryBytes: temporary?.bytes ?? null,
      approximate: !!(total.skipped || logs.skipped || crashes.skipped || temporary?.skipped),
    };
  }
  clear(kind: unknown): Promise<StorageCleanup> {
    if (kind !== 'cache' && kind !== 'diagnostics') return Promise.reject(new Error('无效的清理类型。'));
    if (this.clearing) return Promise.reject(new Error('正在清理，请稍后再试。'));
    this.clearing = this.performClear(kind).finally(() => { this.clearing = undefined; });
    return this.clearing;
  }
  private async performClear(kind: 'cache' | 'diagnostics'): Promise<StorageCleanup> {
    let skippedFiles = 0;
    if (kind === 'cache') await this.session.clearCache();
    else {
      const results = await Promise.all([inspect(this.paths.logs, true), inspect(this.paths.crashes, true)]);
      skippedFiles = results.reduce((sum, result) => sum + result.skipped, 0);
    }
    return { info: await this.info(), skippedFiles };
  }
}
