import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

console.log("Starting logger test...");

const LOG_FILE = join(import.meta.dir, '..', 'data', 'system.log');

// Wait 2 seconds for server logs to be written
await new Promise(resolve => setTimeout(resolve, 2000));

if (!existsSync(LOG_FILE)) {
  throw new Error("system.log file was not created!");
}

const content = readFileSync(LOG_FILE, 'utf8');
console.log("--- system.log content snapshot ---");
console.log(content.split('\n').slice(-10).join('\n'));
console.log("-----------------------------------");

if (content.includes("System logger initialized")) {
  console.log("✅ SYSTEM LOGGER TEST PASSED!");
} else {
  throw new Error("Expected log message not found in system.log");
}
