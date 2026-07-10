const PORT = 3000;
const BASE_URL = `http://127.0.0.1:${PORT}`;

async function testAdminPrivileges() {
  console.log("Starting Admin Privileges & Wallet Tests...");

  const playerA = `pa_${Math.random().toString(36).slice(2, 7)}`;
  const pass = "password123";

  // 1. Register Player A
  console.log(`Registering Player A: ${playerA}`);
  const regARes = await fetch(`${BASE_URL}/api/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: playerA, password: pass })
  });
  const regAData = await regARes.json();
  console.log("Player A Register response:", regAData);

  // 2. Login as Admin
  console.log("Logging in as admin...");
  const adminRes = await fetch(`${BASE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: "admin", password: "123321" })
  });
  const adminData = await adminRes.json();
  console.log("Admin Login response:", adminData);
  if (adminData.balance !== "Vô hạn") {
    throw new Error(`Expected admin balance to be 'Vô hạn', got ${adminData.balance}`);
  }

  // 3. Connect Admin WebSocket
  console.log("Connecting Admin WebSocket...");
  const wsAdmin = new WebSocket(`ws://127.0.0.1:${PORT}/ws?token=${adminData.token}`);
  let adminWsBalance = null;
  wsAdmin.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'state') {
      adminWsBalance = data.userBalance;
    }
  };
  await new Promise((resolve) => wsAdmin.onopen = resolve);
  await new Promise((resolve) => setTimeout(resolve, 500));
  console.log(`Admin WS Balance: ${adminWsBalance}`);
  if (adminWsBalance !== "Vô hạn") {
    throw new Error(`Expected admin WS balance to be 'Vô hạn', got ${adminWsBalance}`);
  }

  // 4. Connect Player A WebSocket
  console.log("Connecting Player A WebSocket...");
  const wsPlayerA = new WebSocket(`ws://127.0.0.1:${PORT}/ws?token=${regAData.token}`);
  let playerABalance = 0;
  wsPlayerA.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'state') {
      playerABalance = data.userBalance;
    }
  };
  await new Promise((resolve) => wsPlayerA.onopen = resolve);
  await new Promise((resolve) => setTimeout(resolve, 500));
  console.log(`Player A Initial Balance: ${playerABalance}`);

  // 5. Admin adds 500,000 balance to Player A
  console.log(`Admin adding 500,000 balance to Player A (${playerA})...`);
  let adminMessage = null;
  wsAdmin.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'add_balance_success') {
      adminMessage = data.message;
    }
  };
  wsAdmin.send(JSON.stringify({ action: 'addPlayerBalance', username: playerA, amount: 500000 }));
  await new Promise((resolve) => setTimeout(resolve, 500));
  console.log(`Admin response message: ${adminMessage}`);
  console.log(`Player A Balance after admin add: ${playerABalance}`);
  if (playerABalance !== 1500000) {
    throw new Error(`Expected Player A balance to be 1500000, got ${playerABalance}`);
  }
  if (!adminMessage || !adminMessage.includes("Đã cộng 500,000 vàng")) {
    throw new Error("Expected admin success message!");
  }

  // 6. Admin placing a bet (does not fail and does not affect admin balance)
  console.log("Admin placing a bet of 200,000...");
  wsAdmin.send(JSON.stringify({ action: 'placeBet', amount: 200000 }));
  await new Promise((resolve) => setTimeout(resolve, 500));
  
  // Re-fetch admin balance from next state broadcast to ensure it's still Vô hạn
  wsAdmin.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'state') {
      adminWsBalance = data.userBalance;
    }
  };
  wsAdmin.send(JSON.stringify({ action: 'getState' })); // Trigger state broadcast
  await new Promise((resolve) => setTimeout(resolve, 500));
  console.log(`Admin WS Balance after bet: ${adminWsBalance}`);
  if (adminWsBalance !== "Vô hạn") {
    throw new Error(`Admin balance should remain 'Vô hạn', got ${adminWsBalance}`);
  }

  wsAdmin.close();
  wsPlayerA.close();
  console.log("✅ ALL ADMIN PRIVILEGE & WALLET TESTS PASSED!");
}

try {
  await testAdminPrivileges();
} catch (err) {
  console.error("❌ TEST FAILED:", err);
  process.exit(1);
}
