import crypto from "crypto";

export async function verifyShopifyHmac(request) {
  const hmacHeader = request.headers.get("x-shopify-hmac-sha256");
  const topicHeader = request.headers.get("x-shopify-topic");
  const shopHeader = request.headers.get("x-shopify-shop-domain");

  if (!hmacHeader) {
    console.log(`[HMAC DEBUG] Failed: Missing x-shopify-hmac-sha256 header (Topic: ${topicHeader || 'unknown'}, Shop: ${shopHeader || 'unknown'})`);
    return { valid: false, payload: null, shopDomain: null, reason: "Missing x-shopify-hmac-sha256 header" };
  }

  try {
    const clonedRequest = request.clone();
    const rawBody = await clonedRequest.text();

    const apiSecret = process.env.SHOPIFY_API_SECRET || "";
    if (!apiSecret) {
      console.error("[HMAC DEBUG] CRITICAL: SHOPIFY_API_SECRET environment variable is missing or empty!");
    }

    const calculatedHmac = crypto
      .createHmac("sha256", apiSecret)
      .update(rawBody, "utf8")
      .digest("base64");

    const receivedHmac = hmacHeader.trim();
    const computedHmac = calculatedHmac.trim();

    const hmacBuffer = Buffer.from(receivedHmac, "utf8");
    const calcBuffer = Buffer.from(computedHmac, "utf8");

    let isValid = false;
    if (hmacBuffer.length === calcBuffer.length && crypto.timingSafeEqual(hmacBuffer, calcBuffer)) {
      isValid = true;
    }

    let payload = {};
    try {
      payload = JSON.parse(rawBody || "{}");
    } catch (_e) {
      payload = {};
    }

    const shopDomain = shopHeader || payload?.shop_domain || null;

    console.log(`[HMAC DEBUG] Result: ${isValid ? "VALID (200)" : "INVALID (401)"}`, {
      topic: topicHeader,
      shopDomain,
      receivedHmac,
      computedHmac,
      apiSecretConfigured: !!apiSecret,
      rawBodyLength: rawBody.length,
      rawBodySnippet: rawBody.substring(0, 150),
    });

    return { valid: isValid, payload, shopDomain, rawBody };
  } catch (err) {
    console.error("[HMAC DEBUG] Exception during HMAC check:", err);
    return { valid: false, payload: null, shopDomain: null, reason: err?.message };
  }
}
