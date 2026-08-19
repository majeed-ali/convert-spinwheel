import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Webhook requests can trigger multiple times and after an app has already been uninstalled.
  // If this webhook already ran, the session may have been deleted previously.
  if (session) {
    await db.session.deleteMany({ where: { shop } });
  }

  // Reset shop plan to FREE and clear tokens on uninstall so reinstalls request approval again
  try {
    await db.shop.updateMany({
      where: { shopifyDomain: shop },
      data: {
        accessToken: null,
        currentPlan: "FREE",
        usageSubscriptionLineItemId: null,
      },
    });
  } catch (err) {
    console.error(`[CS Webhook] Error updating shop on uninstall for ${shop}:`, err);
  }

  return new Response();
};
