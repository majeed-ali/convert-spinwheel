import { redirect } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getOrInitShop } from "../services/billing.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrInitShop(session.shop, session.accessToken);

  // Create default campaign with standard slices
  const campaign = await prisma.campaign.create({
    data: {
      shopId: shop.id,
      name: `Spin Wheel Campaign #${Math.floor(100 + Math.random() * 900)}`,
      type: "POPUP",
      status: "ACTIVE",
      isABTest: false,
      triggers: JSON.stringify({
        exitIntent: true,
        scrollDepth: 50,
        timeDelay: 5,
        pageUrlRules: [],
        cartValueMin: 0,
      }),
      themeSettings: JSON.stringify({
        title: "Spin & Win Exclusive Discount!",
        subtitle: "Enter your email for a chance to win up to 20% off!",
        buttonText: "Spin The Wheel Now",
        floatingLauncherText: "🎁 Spin to Win!",
        primaryColor: "#4F46E5",
        backgroundColor: "#FFFFFF",
        textColor: "#1F2937",
        requirePhone: false,
        gdprNotice: "By spinning, you agree to receive marketing updates.",
      }),
      segments: {
        create: [
          { label: "10% OFF", discountType: "PERCENTAGE", discountValue: "10", winProbability: 35, hexColor: "#EF4444", position: 0 },
          { label: "15% OFF", discountType: "PERCENTAGE", discountValue: "15", winProbability: 25, hexColor: "#3B82F6", position: 1 },
          { label: "$5 OFF", discountType: "FIXED_AMOUNT", discountValue: "5", winProbability: 20, hexColor: "#10B981", position: 2 },
          { label: "FREE SHIPPING", discountType: "FREE_SHIPPING", discountValue: "0", winProbability: 10, hexColor: "#F59E0B", position: 3 },
          { label: "20% OFF", discountType: "PERCENTAGE", discountValue: "20", winProbability: 5, hexColor: "#8B5CF6", position: 4 },
          { label: "TRY AGAIN", discountType: "TRY_AGAIN", discountValue: "0", winProbability: 5, hexColor: "#6B7280", position: 5 },
        ],
      },
    },
  });

  return redirect(`/app/campaigns/${campaign.id}`);
};
