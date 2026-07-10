const PORT = 3000;
const BASE_URL = `http://127.0.0.1:${PORT}`;

async function runTests() {
  console.log("Starting change password API tests...");

  const username = `cp_test_${Math.random().toString(36).slice(2, 7)}`;
  const password = "oldpassword123";
  const newPassword = "newpassword456";

  // 1. Register User
  console.log(`Registering user: ${username}`);
  const regRes = await fetch(`${BASE_URL}/api/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const regData = await regRes.json();
  if (!regData.success) {
    throw new Error(`Failed to register: ${regData.error}`);
  }
  let token = regData.token;
  console.log(`Registered successfully! Token: ${token}`);

  // 2. Change password with incorrect old password
  console.log("Attempting password change with wrong old password...");
  const changeRes1 = await fetch(`${BASE_URL}/api/change-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ oldPassword: "wrongpassword", newPassword })
  });
  const changeData1 = await changeRes1.json();
  console.log(`Response (expect fail):`, changeData1);
  if (changeData1.success) {
    throw new Error("Password change succeeded with incorrect old password!");
  }

  // 3. Change password with correct old password
  console.log("Attempting password change with correct old password...");
  const changeRes2 = await fetch(`${BASE_URL}/api/change-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ oldPassword: password, newPassword })
  });
  const changeData2 = await changeRes2.json();
  console.log(`Response (expect success):`, changeData2);
  if (!changeData2.success) {
    throw new Error(`Password change failed: ${changeData2.error}`);
  }

  // 4. Try logging in with the old password (should fail since sessions are revoked and credentials changed)
  console.log("Logging in with old password (should fail)...");
  const loginRes1 = await fetch(`${BASE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const loginData1 = await loginRes1.json();
  console.log("Response:", loginData1);
  if (loginData1.success) {
    throw new Error("Logged in successfully using revoked old password!");
  }

  // 5. Try logging in with new password (should succeed)
  console.log("Logging in with new password (should succeed)...");
  const loginRes2 = await fetch(`${BASE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: newPassword })
  });
  const loginData2 = await loginRes2.json();
  console.log("Response:", loginData2);
  if (!loginData2.success) {
    throw new Error(`Failed to log in with new password: ${loginData2.error}`);
  }

  console.log("✅ ALL PASSWORD CHANGE API TESTS PASSED!");
}

try {
  await runTests();
} catch (err) {
  console.error("❌ TEST FAILED:", err);
  process.exit(1);
}
