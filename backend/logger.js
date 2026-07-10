import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const LOG_DIR = join(import.meta.dir, '..', 'data');
const SYSTEM_LOG_FILE = join(LOG_DIR, 'system.log');

if (!existsSync(LOG_DIR)) {
  mkdirSync(LOG_DIR, { recursive: true });
}
if (!existsSync(SYSTEM_LOG_FILE)) {
  writeFileSync(SYSTEM_LOG_FILE, '', 'utf8');
}

function writeToSystemLog(level, args) {
  const timestamp = new Date().toISOString();
  const message = args.map(arg => {
    if (typeof arg === 'object') {
      try {
        return JSON.stringify(arg);
      } catch (e) {
        return String(arg);
      }
    }
    return String(arg);
  }).join(' ');
  
  const logLine = `[${timestamp}] [${level}] ${message}\n`;
  try {
    appendFileSync(SYSTEM_LOG_FILE, logLine, 'utf8');
  } catch (err) {
    process.stderr.write(`Failed to write to system.log: ${err.message}\n`);
  }
}

// Override console methods to capture all stdout/stderr logs
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;
const originalInfo = console.info;

console.log = (...args) => {
  originalLog.apply(console, args);
  writeToSystemLog('INFO', args);
};

console.error = (...args) => {
  originalError.apply(console, args);
  writeToSystemLog('ERROR', args);
};

console.warn = (...args) => {
  originalWarn.apply(console, args);
  writeToSystemLog('WARN', args);
};

console.info = (...args) => {
  originalInfo.apply(console, args);
  writeToSystemLog('INFO', args);
};

console.log("System logger initialized. All logs are being written to:", SYSTEM_LOG_FILE);
