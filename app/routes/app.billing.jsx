import { redirect } from "react-router";
import { useLoaderData, useSubmit } from "react-router";
import { Page, Card, Grid, Text, Button, Badge, BlockStack, InlineStack, Banner, ProgressBar } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getOrInitShop } from "../services/billing.server";
import { PLAN_TIERS } from "../services/plans";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrInitShop(session.shop, session.accessToken);

  return JSON.parse(JSON.stringify({ shop, currentPlanKey: shop.currentPlan || "FREE" }));
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const planKey = formData.get("planKey");

  const shop = await getOrInitShop(session.shop, session.accessToken);

  if (planKey === "FREE") {
    await prisma.shop.update({
      where: { id: shop.id },
      data: { currentPlan: "FREE" },
    });
    return Response.json({ success: true });
  }

  const selectedTier = PLAN_TIERS[planKey];
  if (!selectedTier) {
    return Response.json({ error: "Invalid plan selected" }, { status: 400 });
  }

  // Build line items array for appSubscriptionCreate
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

  // Add usage line item for Advanced Overage plan
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

  const returnUrl = `https://${session.shop}/admin/apps/${process.env.SHOPIFY_API_KEY}/app/billing`;

  try {
    const response = await admin.graphql(mutation, {
      variables: {
        name: `Convert Spin: ${selectedTier.name}`,
        returnUrl,
        lineItems,
        test: true,
      },
    });

    const resJson = await response.json();
    const data = resJson.data?.appSubscriptionCreate;

    if (data?.confirmationUrl) {
      return redirect(data.confirmationUrl);
    }

    if (data?.userErrors?.length) {
      console.error("Subscription user errors:", data.userErrors);
      return Response.json({ error: data.userErrors[0].message || "Failed to create subscription" }, { status: 400 });
    }
  } catch (e) {
    console.error("Billing Subscription Error:", e);
    return Response.json({ error: "Billing subscription request failed" }, { status: 500 });
  }

  return Response.json({ error: "Unable to obtain confirmation URL from Shopify Billing API" }, { status: 400 });
};

export default function BillingPage() {
  const { shop, currentPlanKey } = useLoaderData();
  const submit = useSubmit();

  const handleSelectPlan = (planKey) => {
    const formData = new FormData();
    formData.append("planKey", planKey);
    submit(formData, { method: "post" });
  };

  const currentTierInfo = PLAN_TIERS[currentPlanKey] || PLAN_TIERS.FREE;

  return (
    <Page title="Plans & Impression Tier Billing" subtitle="Simple, transparent impression-based plans with soft caps and optional overage billing.">
      <BlockStack gap="500">
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
                      disabled={isCurrent}
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
