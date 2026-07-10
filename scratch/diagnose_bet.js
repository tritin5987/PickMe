import { registerUser, getUserBalance, deductUserBalance } from '../backend/database.js';
import { placeBet, round, config } from '../backend/game.js';

console.log("Starting diagnosis...");

const username = `diag_${Math.random().toString(36).slice(2, 7)}`;
const reg = await registerUser(username, "password123");
console.log("Registered user:", reg);

const bal1 = getUserBalance(username);
console.log("getUserBalance returned:", bal1);

console.log("Config min bet:", config.minBet);

console.log("Calling placeBet...");
const res = placeBet(username, "test-socket-id", 20000);
console.log("placeBet result:", res);

const bal2 = getUserBalance(username);
console.log("getUserBalance after placeBet:", bal2);

console.log("Round players:", round.players);
