import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { EmulatorState } from '../shared/types';

export interface StateStore {
  load(): EmulatorState | null;
  save(state: EmulatorState): void;
  saveMedia(buffer: Buffer, ext: string): { id: string; filePath: string };
  getMediaPath(id: string): string | null;
  getMediaBuffer?(id: string): Buffer | null;
}

export class FileStateStore implements StateStore {
  private readonly dataFile: string;
  private readonly mediaDir: string;
  private memoryFallback: EmulatorState | null = null;
  private memoryMedia = new Map<string, Buffer>();

  constructor(dataFile: string, mediaDir: string) {
    this.dataFile = dataFile;
    this.mediaDir = mediaDir;
  }

  private ensureDirs(): void {
    try {
      fs.mkdirSync(path.dirname(this.dataFile), { recursive: true });
      fs.mkdirSync(this.mediaDir, { recursive: true });
    } catch {
      // Safe no-op on read-only serverless filesystems
    }
  }

  load(): EmulatorState | null {
    try {
      if (!fs.existsSync(this.dataFile)) {
        return this.memoryFallback ? structuredClone(this.memoryFallback) : null;
      }
      const raw = fs.readFileSync(this.dataFile, 'utf-8');
      const parsed = JSON.parse(raw) as EmulatorState;
      this.memoryFallback = structuredClone(parsed);
      return parsed;
    } catch {
      return this.memoryFallback ? structuredClone(this.memoryFallback) : null;
    }
  }

  save(state: EmulatorState): void {
    this.memoryFallback = structuredClone(state);
    try {
      this.ensureDirs();
      const tmpFile = `${this.dataFile}.tmp`;
      const payload = JSON.stringify(state, null, 2);
      fs.writeFileSync(tmpFile, payload, 'utf-8');
      try {
        fs.renameSync(tmpFile, this.dataFile);
      } catch (err: any) {
        // Fallback for file locks / EPERM race condition
        fs.copyFileSync(tmpFile, this.dataFile);
        try {
          fs.unlinkSync(tmpFile);
        } catch {
          // ignore cleanup failure
        }
      }
    } catch {
      // Last-ditch direct write
      try {
        fs.writeFileSync(this.dataFile, JSON.stringify(state, null, 2), 'utf-8');
      } catch {
        // Safe catch: state is preserved in this.memoryFallback in RAM
      }
    }
  }

  saveMedia(buffer: Buffer, ext: string): { id: string; filePath: string } {
    const safeExt = ext.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'bin';
    const id = `media_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}.${safeExt}`;
    try {
      this.ensureDirs();
      const filePath = path.join(this.mediaDir, id);
      fs.writeFileSync(filePath, buffer);
      return { id, filePath };
    } catch {
      this.memoryMedia.set(id, buffer);
      return { id, filePath: id };
    }
  }

  getMediaPath(id: string): string | null {
    const safeId = path.basename(id);
    const full = path.join(this.mediaDir, safeId);
    try {
      return fs.existsSync(full) ? full : null;
    } catch {
      return null;
    }
  }

  getMediaBuffer(id: string): Buffer | null {
    if (this.memoryMedia.has(id)) {
      return this.memoryMedia.get(id)!;
    }
    const safeId = path.basename(id);
    const full = path.join(this.mediaDir, safeId);
    try {
      return fs.existsSync(full) ? fs.readFileSync(full) : null;
    } catch {
      return null;
    }
  }
}

export class MemoryStateStore implements StateStore {
  private state: EmulatorState | null = null;
  private media = new Map<string, Buffer>();

  load(): EmulatorState | null {
    return this.state ? structuredClone(this.state) : null;
  }

  save(state: EmulatorState): void {
    this.state = structuredClone(state);
  }

  saveMedia(buffer: Buffer, ext: string): { id: string; filePath: string } {
    const id = `media_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}.${ext || 'bin'}`;
    this.media.set(id, buffer);
    return { id, filePath: id };
  }

  getMediaPath(_id: string): string | null {
    return null;
  }

  getMediaBuffer(id: string): Buffer | null {
    return this.media.get(id) || null;
  }
}
