/**
 * Generate & Create a Shopify Discount Code via GraphQL Admin API
 */
export async function createDynamicDiscountCode(adminOrToken, segment, campaignName = "Spin Wheel", shopDomain = "") {
  if (!segment || segment.discountType === "TRY_AGAIN") {
    return { success: true, code: null, label: segment?.label || "Try Again" };
  }

  // Check if merchant provided a custom code (e.g. SAVE20)
  const isCustomCode = segment.customCode && segment.customCode.trim().length > 0;
  const customCodeVal = isCustomCode ? segment.customCode.trim().toUpperCase() : null;

  const randomSuffix = Math.random().toString(36).substring(2, 7).toUpperCase();
  const codePrefix = customCodeVal || (segment.label ? segment.label.replace(/[^a-zA-Z0-9]/g, "").substring(0, 6).toUpperCase() : "SPIN") || "SPIN";
  const code = isCustomCode ? customCodeVal : `${codePrefix}-${randomSuffix}`;

  const startsAt = new Date().toISOString();
  const endsAt = new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString(); // Valid for 14 days

  // Construct GraphQL executor function
  let graphqlExecute = null;

  if (adminOrToken && typeof adminOrToken.graphql === "function") {
    graphqlExecute = async (query, variables) => {
      const res = await adminOrToken.graphql(query, { variables });
      return await res.json();
    };
  } else if (typeof adminOrToken === "string" && shopDomain) {
    graphqlExecute = async (query, variables) => {
      const res = await fetch(`https://${shopDomain}/admin/api/2026-10/graphql.json`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": adminOrToken,
        },
        body: JSON.stringify({ query, variables }),
      });
      return await res.json();
    };
  }

  if (!graphqlExecute) {
    console.warn("[CS Discount] No GraphQL executor available, returning generated code:", code);
    return { success: true, code, label: segment.label };
  }

  // 1. FREE SHIPPING DISCOUNT CREATION
  if (segment.discountType === "FREE_SHIPPING") {
    const freeShipMutation = `#graphql
      mutation discountFreeShippingCodeCreate($freeShippingCodeDiscount: DiscountFreeShippingCodeInput!) {
        discountFreeShippingCodeCreate(freeShippingCodeDiscount: $freeShippingCodeDiscount) {
          codeDiscountNode {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    try {
      const json = await graphqlExecute(freeShipMutation, {
        freeShippingCodeDiscount: {
          title: `Convert Spin: ${campaignName} - Free Shipping`,
          code,
          startsAt,
          endsAt,
          usageLimit: isCustomCode ? 10000 : 1,
          appliesOncePerCustomer: true,
          destination: { all: true },
          customerSelection: { all: true },
        },
      });

      const userErrors = json?.data?.discountFreeShippingCodeCreate?.userErrors;
      if (userErrors && userErrors.length > 0) {
        console.warn("[CS Discount] Free Shipping User Errors:", userErrors);
      } else {
        console.log("[CS Discount] Free Shipping Discount created successfully in Shopify:", code);
      }
      return { success: true, code, label: segment.label };
    } catch (err) {
      console.error("[CS Discount] Free Shipping GraphQL Exception:", err);
      return { success: true, code, label: segment.label };
    }
  }

  // 2. PERCENTAGE & FIXED AMOUNT DISCOUNT CREATION
  let discountCustomerGets = {};

  if (segment.discountType === "PERCENTAGE") {
    const val = (parseFloat(segment.discountValue) || 10) / 100;
    discountCustomerGets = {
      value: {
        percentage: Math.min(Math.max(val, 0.01), 1.0),
      },
      items: { all: true },
    };
  } else {
    // FIXED_AMOUNT
    const val = parseFloat(segment.discountValue) || 5;
    discountCustomerGets = {
      value: {
        discountAmount: {
          amount: val.toFixed(2),
          appliesOnEachItem: false,
        },
      },
      items: { all: true },
    };
  }

  const basicDiscountMutation = `#graphql
    mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
      discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
        codeDiscountNode {
          id
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  try {
    const json = await graphqlExecute(basicDiscountMutation, {
      basicCodeDiscount: {
        title: `Convert Spin: ${campaignName} - ${segment.label}`,
        code,
        startsAt,
        endsAt,
        usageLimit: isCustomCode ? 10000 : 1,
        appliesOncePerCustomer: true,
        customerGets: discountCustomerGets,
        customerSelection: { all: true },
      },
    });

    const userErrors = json?.data?.discountCodeBasicCreate?.userErrors;
    if (userErrors && userErrors.length > 0) {
      console.warn("[CS Discount] Basic Discount User Errors:", userErrors);
    } else {
      console.log("[CS Discount] Basic Discount created successfully in Shopify:", code);
    }
    return { success: true, code, label: segment.label };
  } catch (err) {
    console.error("[CS Discount] Basic Discount GraphQL Exception:", err);
    return { success: true, code, label: segment.label };
  }
}
