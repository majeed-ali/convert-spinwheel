import { useEffect } from "react";
import { useLoaderData, useFetcher } from "react-router";
import { Page, Card, Grid, Text, Button, Badge, BlockStack, InlineStack, Banner, ProgressBar, Box } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getOrInitShop, syncShopSubscription } from "../services/billing.server";
import { PLAN_TIERS, getDynamicTierInfo } from "../services/plans";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  let shop = await getOrInitShop(session.shop, session.accessToken);
  shop = await syncShopSubscription(admin, shop);

  const impressions = shop.monthlyImpressionsCount || 0;
  const currentPlanKey = shop.currentPlan || "FREE";
  const dynamicTierInfo = getDynamicTierInfo(impressions, currentPlanKey);

  return JSON.parse(JSON.stringify({ shop, currentPlanKey, dynamicTierInfo }));
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const planKey = formData.get("planKey");

  const shop = await getOrInitShop(session.shop, session.accessToken);

  if (planKey === "FREE") {
    try {
      const activeSubQuery = `#graphql
        query getActiveSubscriptions {
          currentAppInstallation {
            activeSubscriptions {
              id
              status
            }
          }
        }
      `;
      const subRes = await admin.graphql(activeSubQuery);
      const subJson = await subRes.json();
      const subs = subJson?.data?.currentAppInstallation?.activeSubscriptions || [];
      for (const sub of subs) {
        const cancelMutation = `#graphql
          mutation appSubscriptionCancel($id: ID!) {
            appSubscriptionCancel(id: $id, prorate: true) {
              appSubscription {
                id
                status
              }
              userErrors {
                field
                message
              }
            }
          }
        `;
        await admin.graphql(cancelMutation, { variables: { id: sub.id } });
      }
    } catch (e) {
      console.error("[CS Billing] Cancel error:", e);
    }

    await prisma.shop.update({
      where: { id: shop.id },
      data: { currentPlan: "FREE", usageSubscriptionLineItemId: null },
    });
    return Response.json({ success: true, currentPlan: "FREE" });
  }

  const selectedTier = PLAN_TIERS[planKey];
  if (!selectedTier) {
    return Response.json({ error: "Invalid plan selected" }, { status: 400 });
  }

  const lineItems = [
    {
      plan: {
        appRecurringPricingDetails: {
          price: { amount: selectedTier.price, currencyCode: "USD" },
          interval: "EVERY_30_DAYS",
        },
      },
    },
  ];

  if (selectedTier.isOverageAllowed) {
    lineItems.push({
      plan: {
        appUsagePricingDetails: {
          cappedAmount: { amount: 500.0, currencyCode: "USD" },
          terms: "$1.00 per 1,000 impressions over 50,000",
        },
      },
    });
  }

  const returnUrl = `https://${session.shop}/admin/apps/${process.env.SHOPIFY_API_KEY}/app/billing`;

  const mutation = `#graphql
    mutation appSubscriptionCreate($name: String!, $returnUrl: URL!, $lineItems: [AppSubscriptionLineItemInput!]!, $test: Boolean) {
      appSubscriptionCreate(name: $name, returnUrl: $returnUrl, lineItems: $lineItems, test: $test) {
        appSubscription {
          id
        }
        confirmationUrl
        userErrors {
          field
          message
        }
      }
    }
  `;

  try {
    const isTestBilling = process.env.NODE_ENV !== "production";
    const response = await admin.graphql(mutation, {
      variables: {
        name: `Convert Spin ${selectedTier.name}`,
        returnUrl,
        lineItems,
        test: isTestBilling,
      },
    });

    const json = await response.json();
    const confirmationUrl = json.data?.appSubscriptionCreate?.confirmationUrl;
    const userErrors = json.data?.appSubscriptionCreate?.userErrors;

    if (userErrors && userErrors.length > 0) {
      console.error("[CS Billing] User Errors:", userErrors);
      return Response.json({ error: userErrors.map((e) => e.message).join(", ") }, { status: 400 });
    }

    if (confirmationUrl) {
      return Response.json({ confirmationUrl });
    }
  } catch (e) {
    console.error("[CS Billing] GraphQL Exception:", e);
    return Response.json({ error: "Failed to initiate billing request" }, { status: 500 });
  }

  return Response.json({ error: "Unable to obtain confirmation URL from Shopify Billing API" }, { status: 400 });
};

export default function BillingPage() {
  const { shop, currentPlanKey, dynamicTierInfo } = useLoaderData();
  const fetcher = useFetcher();

  const handleSelectPlan = (planKey) => {
    const formData = new FormData();
    formData.append("planKey", planKey);
    fetcher.submit(formData, { method: "post" });
  };

  useEffect(() => {
    if (fetcher.data?.confirmationUrl) {
      const url = fetcher.data.confirmationUrl;
      if (typeof window !== "undefined") {
        if (window.shopify && typeof window.shopify.open === "function") {
          window.shopify.open(url, "_top");
        } else if (typeof open === "function") {
          open(url, "_top");
        } else if (window.top) {
          window.top.location.href = url;
        } else {
          window.location.href = url;
        }
      }
    }
  }, [fetcher.data]);

  const currentTierInfo = PLAN_TIERS[currentPlanKey] || PLAN_TIERS.FREE;
  const isSubmitting = fetcher.state !== "idle";

  return (
    <Page title="Plans & Impression Tier Billing" subtitle="Simple, transparent impression-based plans with feature unlocks and predictable pricing.">
      <BlockStack gap="500">
        {fetcher.data?.error && (
          <Banner status="critical" title="Billing Error">
            {fetcher.data.error}
          </Banner>
        )}

        {dynamicTierInfo?.isSubscribedCapExceeded && (
          <Banner
            title={`Your Impressions Have Reached the ${dynamicTierInfo.dynamicTierName} Bracket`}
            status="info"
          >
            <p>
              Your store has logged <strong>{(shop.monthlyImpressionsCount || 0).toLocaleString()}</strong> impressions this cycle.
              The loader automatically expanded to the <strong>{dynamicTierInfo.dynamicTierName} ({dynamicTierInfo.targetLimit.toLocaleString()} capacity)</strong> tier so you have full visibility of your usage with zero billing surprises.
            </p>
          </Banner>
        )}

        <Card padding="500">
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="100">
                <Text variant="headingMd">
                  Current Subscribed Plan: {currentTierInfo.name}
                </Text>
                <Text variant="bodySm" tone="subdued">
                  Active Usage Bracket: <strong>{dynamicTierInfo?.dynamicTierName} ({dynamicTierInfo?.targetLimit.toLocaleString()} Max)</strong>
                </Text>
              </BlockStack>
              <Badge tone={dynamicTierInfo?.isSubscribedCapExceeded ? "attention" : "success"}>
                {dynamicTierInfo?.isSubscribedCapExceeded ? `Auto-Scaled: ${dynamicTierInfo.dynamicBadge}` : "Active Plan"}
              </Badge>
            </InlineStack>

            <Text variant="bodyMd">
              Impressions tracked this cycle: <strong>{(shop.monthlyImpressionsCount || 0).toLocaleString()}</strong> /{" "}
              {dynamicTierInfo?.targetLimit.toLocaleString()} ({dynamicTierInfo?.progressPercent}%)
            </Text>

            <ProgressBar
              progress={dynamicTierInfo?.progressPercent || 0}
              tone={
                (dynamicTierInfo?.progressPercent || 0) >= 100
                  ? "critical"
                  : (dynamicTierInfo?.progressPercent || 0) > 80
                  ? "warning"
                  : "primary"
              }
            />

            {/* Visual Milestones */}
            <Box padding="300" background="bg-surface-secondary" borderRadius="200">
              <BlockStack gap="200">
                <Text variant="bodySm" fontWeight="semibold" tone="subdued">
                  Transparent Progression Tracker:
                </Text>
                <InlineStack gap="200" wrap>
                  {(dynamicTierInfo?.tierChain || []).map((step) => {
                    const isPassed = step.isCompleted;
                    const isCurrent = step.isActive;
                    return (
                      <Badge
                        key={step.key}
                        tone={isCurrent ? "info" : isPassed ? "success" : "subdued"}
                      >
                        {isPassed ? "✓ " : ""}{step.label} ({step.limit.toLocaleString()}) • {step.price}{isCurrent ? " 🎯 Active" : ""}
                      </Badge>
                    );
                  })}
                </InlineStack>
              </BlockStack>
            </Box>
          </BlockStack>
        </Card>

        {/* 5-Tier Pricing Cards */}
        <Grid>
          {Object.keys(PLAN_TIERS).map((planKey) => {
            const plan = PLAN_TIERS[planKey];
            const isCurrent = currentPlanKey === planKey;
            const isRecommended = dynamicTierInfo?.dynamicTierKey === planKey && !isCurrent;
            const isThisPlanSubmitting = isSubmitting && fetcher.formData?.get("planKey") === planKey;

            return (
              <Grid.Cell key={planKey} columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4, xl: 4 }}>
                <Card padding="500">
                  <BlockStack gap="400" align="space-between">
                    <BlockStack gap="300">
                      <InlineStack align="space-between" blockAlign="center">
                        <Text variant="headingLg">{plan.name}</Text>
                        {isCurrent && <Badge tone="info">Subscribed</Badge>}
                        {isRecommended && <Badge tone="attention">Recommended</Badge>}
                      </InlineStack>

                      <div>
                        <Text variant="heading2xl" as="span">
                          ${plan.price.toFixed(2)}
                        </Text>
                        <Text variant="bodySm" tone="subdued" as="span">
                          {" "}/ month
                        </Text>
                      </div>

                      <Text variant="bodySm" tone="subdued">
                        {plan.description}
                      </Text>

                      <div style={{ height: "1px", backgroundColor: "#E5E7EB", margin: "4px 0" }} />

                      <BlockStack gap="150">
                        {(plan.features || []).map((feature, idx) => (
                          <InlineStack key={idx} gap="200" blockAlign="start">
                            <span style={{ color: "#10B981", fontSize: "14px", lineHeight: "18px" }}>✓</span>
                            <Text variant="bodySm" as="span">{feature}</Text>
                          </InlineStack>
                        ))}
                      </BlockStack>
                    </BlockStack>

                    <div style={{ marginTop: "12px" }}>
                      <Button
                        variant={isCurrent ? "secondary" : isRecommended ? "primary" : "primary"}
                        disabled={isCurrent || isSubmitting}
                        loading={isThisPlanSubmitting}
                        fullWidth
                        onClick={() => handleSelectPlan(planKey)}
                      >
                        {isCurrent ? "Current Plan" : plan.price === 0 ? "Downgrade to Free" : `Select ${plan.name}`}
                      </Button>
                    </div>
                  </BlockStack>
                </Card>
              </Grid.Cell>
            );
          })}
        </Grid>
      </BlockStack>
    </Page>
  );
}
