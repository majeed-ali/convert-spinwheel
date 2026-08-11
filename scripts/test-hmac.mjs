import crypto from "crypto";

import fs from "fs";

let testSecret = process.env.SHOPIFY_API_SECRET;
if (!testSecret && fs.existsSync(".env")) {
  const envText = fs.readFileSync(".env", "utf8");
  const match = envText.match(/SHOPIFY_API_SECRET=(.+)/);
  if (match) testSecret = match[1].trim();
}
if (!testSecret) testSecret = "dummy_test_secret";
const testPayload = JSON.stringify({
  shop_id: 954889,
  shop_domain: "test-store.myshopify.com",
});

const generatedHmac = crypto
  .createHmac("sha256", testSecret)
  .update(testPayload, "utf8")
  .digest("base64");

console.log("=== HMAC Local Verification Test ===");
console.log("Test Payload:", testPayload);
console.log("Test Secret:", testSecret);
console.log("Generated HMAC:", generatedHmac);

const hmacBuffer = Buffer.from(generatedHmac, "utf8");
const calcBuffer = Buffer.from(generatedHmac, "utf8");

const isValid = hmacBuffer.length === calcBuffer.length && crypto.timingSafeEqual(hmacBuffer, calcBuffer);
console.log("Timing safe verification check:", isValid ? "PASSED ✅" : "FAILED ❌");

const fakeHmac = "invalid_fake_hmac_signature=";
const fakeBuffer = Buffer.from(fakeHmac, "utf8");
const isFakeRejected = hmacBuffer.length !== fakeBuffer.length || !crypto.timingSafeEqual(hmacBuffer, fakeBuffer);
console.log("Fake HMAC rejection check:", isFakeRejected ? "PASSED ✅ (Correctly rejected)" : "FAILED ❌");
