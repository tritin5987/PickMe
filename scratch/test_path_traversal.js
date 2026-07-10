const PORT = 3000;
const BASE_URL = `http://127.0.0.1:${PORT}`;

async function testPathTraversal() {
  console.log("Starting Path Traversal prevention test...");

  // Vector 1: Client normalized (usually resolves to 404 or blocked by client)
  const res1 = await fetch(`${BASE_URL}/../data/pickme.sqlite`);
  console.log("Vector 1 status:", res1.status);

  // Vector 2: Encoded traversal bypasses client-side normalization
  const res2 = await fetch(`${BASE_URL}/%2e%2e/%2e%2e/data/pickme.sqlite`);
  console.log("Vector 2 (encoded) status:", res2.status);
  
  if (res2.status === 403) {
    console.log("✅ PATH TRAVERSAL TEST PASSED! Server returned 403 Access Denied.");
  } else if (res2.status === 200) {
    throw new Error("❌ VULNERABILITY DETECTED: Database file is downloadable!");
  } else {
    console.log(`Server returned status ${res2.status} (which prevents traversal successfully).`);
  }
}

try {
  await testPathTraversal();
} catch (err) {
  console.error("❌ TEST FAILED:", err);
  process.exit(1);
}
