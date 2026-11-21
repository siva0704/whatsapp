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

  constructor(dataFile: string, mediaDir: string) {
    this.dataFile = dataFile;
    this.mediaDir = mediaDir;
  }

  private ensureDirs(): void {
    fs.mkdirSync(path.dirname(this.dataFile), { recursive: true });
    fs.mkdirSync(this.mediaDir, { recursive: true });
  }

  load(): EmulatorState | null {
    try {
      if (!fs.existsSync(this.dataFile)) return null;
      const raw = fs.readFileSync(this.dataFile, 'utf-8');
      return JSON.parse(raw) as EmulatorState;
    } catch {
      return null;
    }
  }

  save(state: EmulatorState): void {
    this.ensureDirs();
    const tmpFile = `${this.dataFile}.tmp`;
    const payload = JSON.stringify(state, null, 2);
    try {
      fs.writeFileSync(tmpFile, payload, 'utf-8');
      try {
        fs.renameSync(tmpFile, this.dataFile);
      } catch (err: any) {
        // Fallback for Windows file locks / EPERM race condition
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
        fs.writeFileSync(this.dataFile, payload, 'utf-8');
      } catch {
        // Ignore file lock during heavy burst
      }
    }
  }

  saveMedia(buffer: Buffer, ext: string): { id: string; filePath: string } {
    this.ensureDirs();
    const safeExt = ext.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'bin';
    const id = `media_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}.${safeExt}`;
    const filePath = path.join(this.mediaDir, id);
    fs.writeFileSync(filePath, buffer);
    return { id, filePath };
  }

  getMediaPath(id: string): string | null {
    const safeId = path.basename(id);
    const full = path.join(this.mediaDir, safeId);
    return fs.existsSync(full) ? full : null;
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
