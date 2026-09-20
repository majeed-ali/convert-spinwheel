export const PLAN_TIERS = {
  FREE: {
    key: "FREE",
    name: "Free Plan",
    monthlyImpressions: 1000,
    price: 0.0,
    badgeColor: "#38BDF8",
    badgeBg: "rgba(56, 189, 248, 0.15)",
    description: "Ideal for new stores testing the spin wheel engine.",
    features: [
      "1,000 monthly impressions",
      "1 active spin wheel campaign",
      "Standard spin & win pop-up",
      "Powered by Convert Spin watermark",
      "Standard email collection",
    ],
  },
  STARTER: {
    key: "STARTER",
    name: "Starter Plan",
    monthlyImpressions: 5000,
    price: 2.99,
    badgeColor: "#34D399",
    badgeBg: "rgba(52, 211, 153, 0.15)",
    description: "Perfect for budding stores wanting a clean, branded experience.",
    features: [
      "5,000 monthly impressions",
      "Remove 'Powered by' watermark",
      "Custom brand colors & typography",
      "Email & phone number capture",
      "Custom floating launcher button",
    ],
  },
  BASIC: {
    key: "BASIC",
    name: "Basic Plan",
    monthlyImpressions: 20000,
    price: 5.99,
    badgeColor: "#60A5FA",
    badgeBg: "rgba(96, 165, 250, 0.15)",
    description: "Our core volume plan for active stores seeking more conversions.",
    features: [
      "20,000 monthly impressions",
      "Multiple active campaigns",
      "Exit-intent & scroll depth triggers",
      "Cart value minimum targeting",
      "Detailed lead analytics & CSV export",
    ],
  },
  GROWTH: {
    key: "GROWTH",
    name: "Growth Plan",
    monthlyImpressions: 50000,
    price: 9.99,
    badgeColor: "#818CF8",
    badgeBg: "rgba(129, 140, 248, 0.15)",
    description: "For scaling brands needing automated email marketing sync.",
    features: [
      "50,000 monthly impressions",
      "Klaviyo, Mailchimp & Omnisend sync",
      "Time delay & page-specific smart rules",
      "Campaign performance & revenue tracking",
      "Scheduled flash sale spin wheels",
    ],
  },
  PRO: {
    key: "PRO",
    name: "Pro Plan",
    monthlyImpressions: 150000,
    price: 19.99,
    badgeColor: "#F59E0B",
    badgeBg: "rgba(245, 158, 11, 0.15)",
    description: "Maximum capacity and advanced tools for high-volume stores.",
    features: [
      "150,000 monthly impressions",
      "Unlimited spin wheel campaigns",
      "Built-in A/B split testing engine",
      "All marketing integrations included",
      "Priority 24/7 developer support",
    ],
  },
};

/**
 * Calculates dynamic tier tracking and auto-adjusting progress bar limit.
 * As impressions increase, loader automatically expands across packages:
 * 0 - 1,000: Free (1,000 cap)
 * 1,001 - 5,000: Starter (5,000 cap)
 * 5,001 - 20,000: Basic (20,000 cap)
 * 20,001 - 50,000: Growth (50,000 cap)
 * 50,001 - 150,000: Pro (150,000 cap)
 * > 150,000: Pro + 25k milestone extensions
 */
export function getDynamicTierInfo(impressionsCount = 0, subscribedPlanKey = "FREE") {
  const count = Math.max(0, Number(impressionsCount) || 0);
  let normalizedSubKey = (subscribedPlanKey || "FREE").toUpperCase();
  if (normalizedSubKey === "GROW") normalizedSubKey = "GROWTH";
  if (normalizedSubKey === "ADVANCED") normalizedSubKey = "PRO";

  const subscribedPlan = PLAN_TIERS[normalizedSubKey] || PLAN_TIERS.FREE;
  const subscribedLimit = subscribedPlan.monthlyImpressions || 1000;

  let dynamicTierKey = "FREE";
  let targetLimit = 1000;
  let dynamicTierName = "Free Plan";
  let dynamicBadge = "FREE";
  let nextTierKey = "STARTER";
  let nextTierName = "Starter Plan";
  let nextTierLimit = 5000;

  if (count < 1000) {
    dynamicTierKey = "FREE";
    targetLimit = 1000;
    dynamicTierName = "Free Plan";
    dynamicBadge = "FREE";
    nextTierKey = "STARTER";
    nextTierName = "Starter Plan";
    nextTierLimit = 5000;
  } else if (count < 5000) {
    dynamicTierKey = "STARTER";
    targetLimit = 5000;
    dynamicTierName = "Starter Plan";
    dynamicBadge = "STARTER";
    nextTierKey = "BASIC";
    nextTierName = "Basic Plan";
    nextTierLimit = 20000;
  } else if (count < 20000) {
    dynamicTierKey = "BASIC";
    targetLimit = 20000;
    dynamicTierName = "Basic Plan";
    dynamicBadge = "BASIC";
    nextTierKey = "GROWTH";
    nextTierName = "Growth Plan";
    nextTierLimit = 50000;
  } else if (count < 50000) {
    dynamicTierKey = "GROWTH";
    targetLimit = 50000;
    dynamicTierName = "Growth Plan";
    dynamicBadge = "GROWTH";
    nextTierKey = "PRO";
    nextTierName = "Pro Plan";
    nextTierLimit = 150000;
  } else if (count < 150000) {
    dynamicTierKey = "PRO";
    targetLimit = 150000;
    dynamicTierName = "Pro Plan";
    dynamicBadge = "PRO";
    nextTierKey = "PRO_PLUS";
    nextTierName = "Pro Extended";
    nextTierLimit = 200000;
  } else {
    dynamicTierKey = "PRO";
    targetLimit = Math.ceil(count / 25000) * 25000;
    dynamicTierName = "Pro Plan (Extended)";
    dynamicBadge = "PRO+";
    nextTierKey = "ENTERPRISE";
    nextTierName = "Enterprise";
    nextTierLimit = targetLimit + 25000;
  }

  const dynamicTier = PLAN_TIERS[dynamicTierKey] || PLAN_TIERS.PRO;
  const progressPercent = Math.min(100, Math.round((count / targetLimit) * 100));
  const isSubscribedCapExceeded = count >= subscribedLimit;

  // Progression milestones for UI visualization
  const tierChain = [
    { key: "FREE", label: "Free", limit: 1000, price: "$0", isCompleted: count >= 1000, isActive: dynamicTierKey === "FREE" },
    { key: "STARTER", label: "Starter", limit: 5000, price: "$2.99", isCompleted: count >= 5000, isActive: dynamicTierKey === "STARTER" },
    { key: "BASIC", label: "Basic", limit: 20000, price: "$5.99", isCompleted: count >= 20000, isActive: dynamicTierKey === "BASIC" },
    { key: "GROWTH", label: "Growth", limit: 50000, price: "$9.99", isCompleted: count >= 50000, isActive: dynamicTierKey === "GROWTH" },
    { key: "PRO", label: "Pro", limit: 150000, price: "$19.99", isCompleted: count >= 150000, isActive: dynamicTierKey === "PRO" },
  ];

  return {
    count,
    dynamicTierKey,
    dynamicTierName,
    dynamicBadge,
    targetLimit,
    progressPercent,
    nextTierKey,
    nextTierName,
    nextTierLimit,
    subscribedPlanKey: normalizedSubKey,
    subscribedPlanName: subscribedPlan.name,
    subscribedLimit,
    isSubscribedCapExceeded,
    overageCount: Math.max(0, count - subscribedLimit),
    tierChain,
  };
}


