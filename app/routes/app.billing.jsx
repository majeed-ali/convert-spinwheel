import { useEffect } from "react";
import { useLoaderData, useFetcher } from "react-router";
import { Page, Card, Grid, Text, Button, Badge, BlockStack, InlineStack, Banner, ProgressBar } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getOrInitShop } from "../services/billing.server";
import { PLAN_TIERS } from "../services/plans";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = await getOrInitShop(session.shop, session.accessToken);

  let activePlanKey = "FREE";
  try {
    const activeSubQuery = `#graphql
      query getActiveSubscriptions {
        currentAppInstallation {
          activeSubscriptions {
            id
            name
            status
          }
        }
      }
    `;
    const subRes = await admin.graphql(activeSubQuery);
    const subJson = await subRes.json();
    const subs = subJson?.data?.currentAppInstallation?.activeSubscriptions || [];

    if (subs.length > 0 && subs[0].status === "ACTIVE") {
      const subName = (subs[0].name || "").toUpperCase();
      if (subName.includes("ADVANCED")) {
        activePlanKey = "ADVANCED";
      } else if (subName.includes("GROW")) {
        activePlanKey = "GROW";
      } else if (subName.includes("BASIC")) {
        activePlanKey = "BASIC";
      }

      if (shop.currentPlan !== activePlanKey) {
        await prisma.shop.update({
          where: { id: shop.id },
          data: { currentPlan: activePlanKey },
        });
        shop.currentPlan = activePlanKey;
      }
    } else if (shop.currentPlan !== "FREE") {
      await prisma.shop.update({
        where: { id: shop.id },
        data: { currentPlan: "FREE", usageSubscriptionLineItemId: null },
      });
      shop.currentPlan = "FREE";
    }
  } catch (e) {
    console.error("[CS Billing] Loader check error:", e);
  }

  return JSON.parse(JSON.stringify({ shop, currentPlanKey: activePlanKey || shop.currentPlan || "FREE" }));
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
    const response = await admin.graphql(mutation, {
      variables: {
        name: `Convert Spin: ${selectedTier.name}`,
        returnUrl,
        lineItems,
        test: false,
      },
    });

    const resJson = await response.json();
    const data = resJson.data?.appSubscriptionCreate;

    if (data?.confirmationUrl) {
      return Response.json({ success: true, confirmationUrl: data.confirmationUrl });
    }

    if (data?.userErrors?.length > 0) {
      console.error("Subscription user errors:", data.userErrors);
      return Response.json({ error: data.userErrors[0].message || "Failed to create subscription" }, { status: 400 });
    }
  } catch (e) {
    console.error("[CS Billing] GraphQL Exception:", e);
    return Response.json({ error: "Failed to initiate billing request" }, { status: 500 });
  }

  return Response.json({ error: "Unable to obtain confirmation URL from Shopify Billing API" }, { status: 400 });
};

export default function BillingPage() {
  const { shop, currentPlanKey } = useLoaderData();
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
    <Page title="Plans & Impression Tier Billing" subtitle="Simple, transparent impression-based plans with soft caps and optional overage billing.">
      <BlockStack gap="500">
        {fetcher.data?.error && (
          <Banner status="critical" title="Billing Error">
            {fetcher.data.error}
          </Banner>
        )}

        <Card padding="500">
          <BlockStack gap="300">
            <InlineStack align="space-between">
              <Text variant="headingMd">Current Active Plan: {currentTierInfo.name}</Text>
              <Badge tone="success">Active</Badge>
            </InlineStack>

            <Text variant="bodyMd">
              Impressions tracked this cycle: <strong>{shop.monthlyImpressionsCount.toLocaleString()}</strong> /{" "}
              {currentTierInfo.isOverageAllowed ? "Unlimited (50,000 included)" : `${currentTierInfo.monthlyImpressions.toLocaleString()} max`}
            </Text>

            <ProgressBar
              progress={
                currentTierInfo.isOverageAllowed
                  ? Math.min(100, (shop.monthlyImpressionsCount / 50000) * 100)
                  : Math.min(100, Math.round((shop.monthlyImpressionsCount / currentTierInfo.monthlyImpressions) * 100))
              }
            />
          </BlockStack>
        </Card>

        <Grid>
          {Object.keys(PLAN_TIERS).map((planKey) => {
            const plan = PLAN_TIERS[planKey];
            const isCurrent = currentPlanKey === planKey;
            const isThisPlanSubmitting = isSubmitting && fetcher.formData?.get("planKey") === planKey;

            return (
              <Grid.Cell key={planKey} columnSpan={{ xs: 6, sm: 6, md: 3, lg: 3, xl: 3 }}>
                <Card padding="500">
                  <BlockStack gap="400" align="space-between">
                    <BlockStack gap="200">
                      <InlineStack align="space-between">
                        <Text variant="headingLg">{plan.name}</Text>
                        {isCurrent && <Badge tone="info">Active</Badge>}
                      </InlineStack>

                      <Text variant="heading2xl" as="p">
                        ${plan.price.toFixed(2)}
                        <Text variant="bodySm" tone="subdued">
                          /month
                        </Text>
                      </Text>

                      <Text variant="bodyMd">
                        Includes <strong>{plan.monthlyImpressions.toLocaleString()}</strong> impressions / mo
                      </Text>

                      {plan.isOverageAllowed ? (
                        <Banner status="info" title="Overage Billing Terms">
                          +$1.00 for every additional 1,000 impressions over 50,000.
                        </Banner>
                      ) : (
                        <Text variant="bodySm" tone="subdued">
                          Soft-cap limit. Prompt in-app to upgrade once exceeded.
                        </Text>
                      )}
                    </BlockStack>

                    <Button
                      variant={isCurrent ? "secondary" : "primary"}
                      disabled={isCurrent || isSubmitting}
                      loading={isThisPlanSubmitting}
                      onClick={() => handleSelectPlan(planKey)}
                    >
                      {isCurrent ? "Current Plan" : `Upgrade to ${plan.name}`}
                    </Button>
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
