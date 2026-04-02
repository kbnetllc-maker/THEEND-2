import fs from 'node:fs';
import path from 'node:path';

const LOG_FILE = process.env.FLAXNET_LOG_FILE?.trim();

function writeFileLine(level: string, msg: string, meta?: Record<string, unknown>) {
  if (!LOG_FILE) return;
  try {
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      msg,
      ...meta,
    });
    fs.appendFileSync(LOG_FILE, `${line}\n`);
  } catch (e) {
    console.error('[logger] file write failed', e);
  }
}

export const logger = {
  info(msg: string, meta?: Record<string, unknown>) {
    console.log(`[flaxnet] ${msg}`, meta ?? '');
    writeFileLine('info', msg, meta);
  },
  warn(msg: string, meta?: Record<string, unknown>) {
    console.warn(`[flaxnet] ${msg}`, meta ?? '');
    writeFileLine('warn', msg, meta);
  },
  error(msg: string, meta?: Record<string, unknown>) {
    console.error(`[flaxnet] ${msg}`, meta ?? '');
    writeFileLine('error', msg, meta);
  },
};

/** Resolve path relative to cwd for .env.example docs */
export function defaultLogFileHint(): string {
  return path.join(process.cwd(), 'logs', 'flaxnet-api.log');
}
