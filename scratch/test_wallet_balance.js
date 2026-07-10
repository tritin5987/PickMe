const PORT = 3000;
const BASE_URL = `http://127.0.0.1:${PORT}`;

async function testWallet() {
  console.log("Starting Wallet/Balance Integration Tests...");

  const userA = `wa_${Math.random().toString(36).slice(2, 7)}`;
  const userB = `wb_${Math.random().toString(36).slice(2, 7)}`;
  const pass = "password123";

  // 1. Register User A
  console.log(`Registering User A: ${userA}`);
  const regARes = await fetch(`${BASE_URL}/api/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: userA, password: pass })
  });
  const regAData = await regARes.json();
  console.log("User A Register response:", regAData);
  if (regAData.balance !== 1000000) {
    throw new Error(`Expected default balance to be 1000000, got ${regAData.balance}`);
  }

  // 2. Register User B
  console.log(`Registering User B: ${userB}`);
  const regBRes = await fetch(`${BASE_URL}/api/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: userB, password: pass })
  });
  const regBData = await regBRes.json();
  console.log("User B Register response:", regBData);

  // 3. Connect via WebSockets and verify balance updates
  console.log("Connecting User A WebSocket...");
  const wsA = new WebSocket(`ws://127.0.0.1:${PORT}/ws?token=${regAData.token}`);
  
  let balanceA = 0;
  let minBet = 10000; // default backup
  wsA.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'state') {
      balanceA = data.userBalance;
      if (data.config && data.config.minBet) {
        minBet = data.config.minBet;
      }
    }
  };

  await new Promise((resolve) => wsA.onopen = resolve);
  // Wait a short bit to receive state
  await new Promise((resolve) => setTimeout(resolve, 500));
  console.log(`User A Initial WebSocket Balance: ${balanceA}, Server minBet: ${minBet}`);
  if (balanceA !== 1000000) {
    throw new Error(`Expected ws balance to be 1000000, got ${balanceA}`);
  }

  // 4. Place bet and verify deduction
  console.log(`User A placing bet of minBet (${minBet})...`);
  wsA.send(JSON.stringify({ action: 'placeBet', amount: minBet }));
  await new Promise((resolve) => setTimeout(resolve, 500));
  console.log(`User A Balance after bet: ${balanceA}`);
  const expectedBalA = 1000000 - minBet;
  if (balanceA !== expectedBalA) {
    throw new Error(`Expected ws balance to be ${expectedBalA}, got ${balanceA}`);
  }

  // 5. Place excessive bet (exceeding balance)
  console.log("User A attempting to place bet of 1,500,000 (exceeds balance)...");
  let errMsg = null;
  wsA.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'state') {
      balanceA = data.userBalance;
    } else if (data.type === 'error') {
      errMsg = data.message;
    }
  };
  wsA.send(JSON.stringify({ action: 'placeBet', amount: 1500000 }));
  await new Promise((resolve) => setTimeout(resolve, 500));
  console.log(`User A Balance after excessive bet: ${balanceA}`);
  console.log(`User A Error received: ${errMsg}`);
  if (!errMsg || !errMsg.includes("Số dư tài khoản không đủ")) {
    throw new Error("Expected balance insufficient error!");
  }
  if (balanceA !== expectedBalA) {
    throw new Error(`Balance should remain ${expectedBalA}`);
  }

  // 6. Connect User B, place bet and test Admin Refund (resetRound)
  console.log("Connecting User B WebSocket...");
  const wsB = new WebSocket(`ws://127.0.0.1:${PORT}/ws?token=${regBData.token}`);
  let balanceB = 0;
  wsB.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'state') {
      balanceB = data.userBalance;
    }
  };
  await new Promise((resolve) => wsB.onopen = resolve);
  await new Promise((resolve) => setTimeout(resolve, 500));
  
  const betB = minBet + 10000;
  console.log(`User B placing bet of ${betB}...`);
  wsB.send(JSON.stringify({ action: 'placeBet', amount: betB }));
  await new Promise((resolve) => setTimeout(resolve, 500));
  console.log(`User B Balance after bet: ${balanceB}`);
  const expectedBalB = 1000000 - betB;
  if (balanceB !== expectedBalB) {
    throw new Error(`Expected User B balance to be ${expectedBalB}, got ${balanceB}`);
  }

  // Login as admin to send resetRound
  const adminLogin = await fetch(`${BASE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: "admin", password: "123321" })
  });
  const adminData = await adminLogin.json();
  const wsAdmin = new WebSocket(`ws://127.0.0.1:${PORT}/ws?token=${adminData.token}`);
  await new Promise((resolve) => wsAdmin.onopen = resolve);

  console.log("Admin triggering resetRound (refund bets)...");
  wsAdmin.send(JSON.stringify({ action: 'resetRound' }));
  await new Promise((resolve) => setTimeout(resolve, 500));

  console.log(`User A Balance after refund: ${balanceA}`);
  console.log(`User B Balance after refund: ${balanceB}`);
  if (balanceA !== 1000000 || balanceB !== 1000000) {
    throw new Error("Expected both users to be refunded to 1,000,000!");
  }

  wsA.close();
  wsB.close();
  wsAdmin.close();
  console.log("✅ ALL WALLET INTEGRATION TESTS PASSED!");
}

try {
  await testWallet();
} catch (err) {
  console.error("❌ TEST FAILED:", err);
  process.exit(1);
}
