export const PLAN_TIERS = {
  FREE: {
    name: "Free Plan",
    monthlyImpressions: 300,
    price: 0.0,
    isOverageAllowed: false,
  },
  BASIC: {
    name: "Basic Plan",
    monthlyImpressions: 1000,
    price: 9.99,
    isOverageAllowed: false,
  },
  GROW: {
    name: "Grow Plan",
    monthlyImpressions: 5000,
    price: 19.99,
    isOverageAllowed: false,
  },
  ADVANCED: {
    name: "Advanced Plan",
    monthlyImpressions: 50000,
    price: 39.99,
    isOverageAllowed: true,
    overageRatePer1000: 1.0,
  },
};
