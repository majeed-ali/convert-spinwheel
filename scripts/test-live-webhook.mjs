import crypto from "crypto";

const targetUrl = process.argv[2] || "https://spinwheel.app.sirpisoftwares.com/webhooks/customers/data_request";
import fs from "fs";

let apiSecret = process.env.SHOPIFY_API_SECRET;
if (!apiSecret && fs.existsSync(".env")) {
  const envText = fs.readFileSync(".env", "utf8");
  const match = envText.match(/SHOPIFY_API_SECRET=(.+)/);
  if (match) apiSecret = match[1].trim();
}
if (!apiSecret) {
  console.error("Error: SHOPIFY_API_SECRET environment variable is missing.");
  process.exit(1);
}

const payloadStr = JSON.stringify({
  shop_id: 954889,
  shop_domain: "test-store.myshopify.com",
  customer: { id: 12345, email: "test@example.com" },
});

const validHmac = crypto
  .createHmac("sha256", apiSecret)
  .update(payloadStr, "utf8")
  .digest("base64");

console.log("=== Testing Webhook Endpoints ===");
console.log("Target URL:", targetUrl);
console.log("Using API Secret:", apiSecret);
console.log("Calculated Valid HMAC:", validHmac);

async function runTests() {
  console.log("\n--- Test 1: Sending VALID HMAC Payload ---");
  try {
    const res1 = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-shopify-hmac-sha256": validHmac,
        "x-shopify-topic": "customers/data_request",
        "x-shopify-shop-domain": "test-store.myshopify.com",
      },
      body: payloadStr,
    });
    console.log(`Response Status: ${res1.status} ${res1.statusText}`);
    console.log(`Response Text: ${await res1.text()}`);
    if (res1.status === 200) {
      console.log("✅ TEST 1 PASSED: Valid HMAC returned 200 OK!");
    } else {
      console.error(`❌ TEST 1 FAILED: Expected 200 OK, got ${res1.status}`);
    }
  } catch (err) {
    console.error("Test 1 Exception:", err.message);
  }

  console.log("\n--- Test 2: Sending FAKE / INVALID HMAC Payload ---");
  try {
    const res2 = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-shopify-hmac-sha256": "fake_invalid_hmac_signature_base64=",
        "x-shopify-topic": "customers/data_request",
        "x-shopify-shop-domain": "test-store.myshopify.com",
      },
      body: payloadStr,
    });
    console.log(`Response Status: ${res2.status} ${res2.statusText}`);
    console.log(`Response Text: ${await res2.text()}`);
    if (res2.status === 400 || res2.status === 401) {
      console.log(`✅ TEST 2 PASSED: Fake HMAC was correctly REJECTED with ${res2.status} ${res2.statusText}!`);
    } else {
      console.error(`❌ TEST 2 FAILED: Expected 400/401 Bad Request, got ${res2.status}`);
    }
  } catch (err) {
    console.error("Test 2 Exception:", err.message);
  }
}

runTests();
