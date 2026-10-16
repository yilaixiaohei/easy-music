import { safeStorage } from "electron";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { UserProfile } from "../shared/contracts";

export interface SavedSession {
  cookie: string;
  profile: UserProfile | null;
}
export interface SessionStorage {
  read(): SavedSession | null;
  write(session: SavedSession): void;
  clear(): void;
}

export class EncryptedSessionStore implements SessionStorage {
  private file: string;
  constructor(private directory: string) {
    this.file = join(directory, "account.enc");
  }

  read(): SavedSession | null {
    if (!existsSync(this.file)) return null;
    if (!safeStorage.isEncryptionAvailable())
      throw new Error("系统加密服务不可用，无法读取登录状态。");
    try {
      const data = JSON.parse(
        safeStorage.decryptString(readFileSync(this.file)),
      );
      if (
        typeof data.cookie !== "string" ||
        !data.cookie.includes("MUSIC_U=")
      ) {
        throw new Error("Invalid session");
      }
      return { cookie: data.cookie, profile: data.profile ?? null };
    } catch {
      throw new Error("保存的登录状态无法读取，请重新扫码登录。");
    }
  }

  write(session: SavedSession): void {
    if (!safeStorage.isEncryptionAvailable())
      throw new Error("系统加密服务不可用，本次登录仅在当前运行期间有效。");
    mkdirSync(this.directory, { recursive: true });
    const encrypted = safeStorage.encryptString(JSON.stringify(session));
    writeFileSync(`${this.file}.tmp`, encrypted, { mode: 0o600 });
    renameSync(`${this.file}.tmp`, this.file);
  }

  clear(): void {
    for (const file of [this.file, `${this.file}.tmp`]) {
      if (existsSync(file)) unlinkSync(file);
    }
  }
}
