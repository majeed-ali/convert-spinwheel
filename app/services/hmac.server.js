import crypto from "crypto";

export async function verifyShopifyHmac(request) {
  const hmacHeader = request.headers.get("x-shopify-hmac-sha256");
  if (!hmacHeader) {
    return { valid: false, payload: null, shopDomain: null };
  }

  try {
    const clonedRequest = request.clone();
    const rawBody = await clonedRequest.text();

    const apiSecret = process.env.SHOPIFY_API_SECRET || "";
    const calculatedHmac = crypto
      .createHmac("sha256", apiSecret)
      .update(rawBody, "utf8")
      .digest("base64");

    const hmacBuffer = Buffer.from(hmacHeader, "utf8");
    const calcBuffer = Buffer.from(calculatedHmac, "utf8");

    if (hmacBuffer.length !== calcBuffer.length || !crypto.timingSafeEqual(hmacBuffer, calcBuffer)) {
      return { valid: false, payload: null, shopDomain: null };
    }

    const payload = JSON.parse(rawBody || "{}");
    const shopDomain = request.headers.get("x-shopify-shop-domain") || payload?.shop_domain || null;

    return { valid: true, payload, shopDomain };
  } catch (_e) {
    return { valid: false, payload: null, shopDomain: null };
  }
}
