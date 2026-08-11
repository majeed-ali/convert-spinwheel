import { authenticate } from "../shopify.server";

export const loader = async () => {
  return new Response("OK", { status: 200 });
};

export const action = async ({ request }) => {
  try {
    const { topic, shop, payload } = await authenticate.webhook(request);
    console.log(`[GDPR Webhook] ${topic} received for ${shop}`, payload);
  } catch (error) {
    console.warn("[GDPR Webhook] customers/data_request webhook auth check:", error?.message || error);
  }

  return new Response("OK", { status: 200 });
};
