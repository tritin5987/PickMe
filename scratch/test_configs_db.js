import { getDbConfigs, updateDbConfig, checkUserExists, loginUser } from '../backend/database.js';

console.log("Starting Database Config verification...");

const configs = getDbConfigs();
console.log("Current configs stored in DB:", configs);

if (configs.DEFAULT_MIN_BET !== "10000") {
  throw new Error(`Expected DEFAULT_MIN_BET to be 10000, got ${configs.DEFAULT_MIN_BET}`);
}
if (configs.DEFAULT_BET_DURATION !== "60") {
  throw new Error(`Expected DEFAULT_BET_DURATION to be 60, got ${configs.DEFAULT_BET_DURATION}`);
}


console.log("Updating DEFAULT_MIN_BET to 20000 in DB...");
updateDbConfig("DEFAULT_MIN_BET", "20000");

const updatedConfigs = getDbConfigs();
console.log("Updated configs stored in DB:", updatedConfigs);
if (updatedConfigs.DEFAULT_MIN_BET !== "20000") {
  throw new Error(`Expected DEFAULT_MIN_BET to be 20000, got ${updatedConfigs.DEFAULT_MIN_BET}`);
}

// Reset back to 10000
updateDbConfig("DEFAULT_MIN_BET", "10000");

// Try logging in as admin using the DB configured password "123321"
console.log("Attempting to log in as admin with password '123321'...");
const loginRes = await loginUser("admin", "123321");
if (loginRes) {
  console.log("Login successful! Token:", loginRes.token);
} else {
  throw new Error("Failed to log in as admin with password '123321'");
}

console.log("✅ ALL DATABASE CONFIG TESTS PASSED!");
