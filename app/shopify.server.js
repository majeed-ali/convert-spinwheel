import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.July26,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  future: {
    expiringOfflineAccessTokens: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.July26;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;

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
