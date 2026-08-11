import { authenticate } from "../shopify.server";

export const loader = async () => {
  return new Response("OK", { status: 200 });
};

export const action = async ({ request }) => {
  try {
    const { topic, shop, payload } = await authenticate.webhook(request);
    const shopDomain = shop || payload?.shop_domain;
    const shopId = payload?.shop_id;

    console.log(`[GDPR Webhook] ${topic} received for ${shopDomain} (Shop ID: ${shopId})`, payload);
  } catch (error) {
    console.warn("[GDPR Webhook] customers/data_request webhook check:", error?.message || error);
  }

  return new Response("OK", { status: 200 });
};
