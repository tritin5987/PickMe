import { registerUser, checkUserExists, db } from '../backend/database.js';

console.log("Checking if user 'Admin' exists...");
try {
  // Let's see if we can register 'Admin' or 'ADMIN'
  const res = await registerUser("Admin", "hacker123");
  console.log("Registered 'Admin' successfully! This is a vulnerability!", res);
} catch (e) {
  console.log("Registration failed (this is good):", e.message);
}

const exists = checkUserExists("Admin");
console.log("checkUserExists('Admin') returned:", exists);

// Clean up if created
db.query("DELETE FROM users WHERE username = 'Admin'").run();
