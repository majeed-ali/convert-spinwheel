import { useState, useEffect } from "react";
import { useLoaderData, useNavigate, useFetcher } from "react-router";
import {
  Page,
  Layout,
  Card,
  Text,
  Button,
  Banner,
  ProgressBar,
  Grid,
  Badge,
  DataTable,
  BlockStack,
  InlineStack,
  Box,
  Modal,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getOrInitShop, syncShopSubscription } from "../services/billing.server";
import { PLAN_TIERS, getDynamicTierInfo } from "../services/plans";

const NEXT_TIER_MAP = {
  FREE: "STARTER",
  STARTER: "BASIC",
  BASIC: "GROWTH",
  GROWTH: "PRO",
  PRO: null,
};

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  let shop = await getOrInitShop(session.shop, session.accessToken);
  shop = await syncShopSubscription(admin, shop);

  // Fetch campaign statistics
  const activeCampaigns = await prisma.campaign.findMany({
    where: { shopId: shop.id },
    include: {
      segments: true,
      _count: {
        select: { leads: true, impressionLogs: true },
      },
    },
  });

  const totalLeads = await prisma.lead.count({
    where: { shopId: shop.id },
  });

  const totalImpressions = shop.monthlyImpressionsCount || 0;
  const optInRate = totalImpressions > 0 ? ((totalLeads / totalImpressions) * 100).toFixed(1) : "0.0";
  
  // Calculate converted revenue estimation ($25 average order value per redemption assumption)
  const estimatedRevenue = (totalLeads * 25 * 0.35).toFixed(2);

  const recentLeads = await prisma.lead.findMany({
    where: { shopId: shop.id },
    take: 5,
    orderBy: { convertedAt: "desc" },
  });

  const currentPlanKey = (shop.currentPlan || "FREE").toUpperCase();
  const currentPlanInfo = PLAN_TIERS[currentPlanKey] || PLAN_TIERS.FREE;
  const dynamicTierInfo = getDynamicTierInfo(totalImpressions, currentPlanKey);
  const isCapExceeded = dynamicTierInfo.isSubscribedCapExceeded;

  const nextPlanKey = NEXT_TIER_MAP[currentPlanKey] || "STARTER";
  const nextPlanInfo = PLAN_TIERS[nextPlanKey] || PLAN_TIERS.STARTER;

  return JSON.parse(
    JSON.stringify({
      shop,
      activeCampaigns,
      totalLeads,
      totalImpressions,
      optInRate,
      estimatedRevenue,
      recentLeads,
      currentPlanInfo,
      dynamicTierInfo,
      isCapExceeded,
      nextPlanKey,
      nextPlanInfo,
    })
  );
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const planKey = formData.get("planKey");

  const selectedTier = PLAN_TIERS[planKey];
  if (!selectedTier || selectedTier.price === 0) {
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

  const returnUrl = `https://${session.shop}/admin/apps/${process.env.SHOPIFY_API_KEY}/app`;

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
      console.error("[CS Dashboard Billing] User Errors:", userErrors);
      return Response.json({ error: userErrors.map((e) => e.message).join(", ") }, { status: 400 });
    }

    if (confirmationUrl) {
      return Response.json({ confirmationUrl });
    }
  } catch (e) {
    console.error("[CS Dashboard Billing] GraphQL Exception:", e);
    return Response.json({ error: "Failed to initiate upgrade request" }, { status: 500 });
  }

  return Response.json({ error: "Unable to obtain confirmation URL from Shopify Billing API" }, { status: 400 });
};

export default function Dashboard() {
  const {
    shop,
    activeCampaigns = [],
    totalLeads = 0,
    totalImpressions = 0,
    optInRate = "0.0",
    estimatedRevenue = "0.00",
    recentLeads = [],
    currentPlanInfo = PLAN_TIERS.FREE,
    dynamicTierInfo = getDynamicTierInfo(0, "FREE"),
    isCapExceeded = false,
    nextPlanKey = "STARTER",
    nextPlanInfo = PLAN_TIERS.STARTER,
  } = useLoaderData() || {};
  const navigate = useNavigate();
  const fetcher = useFetcher();

  const [showUpgradeModal, setShowUpgradeModal] = useState(isCapExceeded);

  const handleInstantUpgrade = (targetKey) => {
    const formData = new FormData();
    formData.append("planKey", targetKey || nextPlanKey);
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

  const leadRows = (recentLeads || []).map((lead) => [
    lead.email || lead.phone || "Anonymous",
    lead.wonDiscountLabel || lead.wonCode || "-",
    lead.wonCode || "-",
    new Date(lead.convertedAt).toLocaleDateString(),
  ]);

  const isUpgrading = fetcher.state !== "idle";

  return (
    <Page
      title="Convert Spin Dashboard"
      subtitle="Gamified Spin Wheel Pop-Up & Lead Generation Engine"
      primaryAction={{
        content: "Create Campaign",
        onAction: () => navigate("/app/campaigns/new"),
      }}
    >
      <BlockStack gap="500">
        {fetcher.data?.error && (
          <Banner status="critical" title="Billing Error">
            {fetcher.data.error}
          </Banner>
        )}

        {isCapExceeded ? (
          <Banner
            title="⚠️ Spin Wheel Pop-Up Is Paused on Storefront"
            status="critical"
            action={{
              content: `⚡ Reactivate Pop-Up (Upgrade to ${nextPlanInfo.name} - $${nextPlanInfo.price.toFixed(2)}/mo)`,
              loading: isUpgrading,
              onAction: () => handleInstantUpgrade(nextPlanKey),
            }}
            secondaryAction={{
              content: "View All 5 Plans",
              onAction: () => navigate("/app/billing"),
            }}
          >
            <p>
              Your store has reached <strong>{totalImpressions.toLocaleString()}</strong> / {dynamicTierInfo.subscribedLimit.toLocaleString()} monthly impressions on the <strong>{dynamicTierInfo.subscribedPlanName}</strong>.
              The spin wheel pop-up has been <strong>automatically paused</strong> on your storefront. Click below to upgrade directly with 1-click and instantly unpause your wheel!
            </p>
          </Banner>
        ) : (
          <Banner
            title="Enable Spin Wheel Pop-Up on Your Storefront"
            status="info"
            action={{
              content: "Enable in Theme Editor",
              onAction: () => {
                if (shop?.shopifyDomain) {
                  window.open(`https://${shop.shopifyDomain}/admin/themes/current/editor?context=apps`, "_blank");
                }
              },
            }}
          >
            <p>
              To display the spin wheel popup and floating <strong>🎁 Spin to Win!</strong> launcher to visitors on your store, turn ON the <strong>Convert Spin Wheel</strong> App Embed in your Shopify Theme Editor.
            </p>
          </Banner>
        )}

        {/* Dynamic Impression Tier Meter */}
        <Card padding="500">
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="100">
                <InlineStack gap="200" blockAlign="center">
                  <Text variant="headingLg" as="h2">
                    Monthly Impression Usage
                  </Text>
                  <Badge tone={isCapExceeded ? "critical" : "success"}>
                    {isCapExceeded ? "⏸️ Pop-Up Paused (Limit Reached)" : "🟢 Pop-Up Active"}
                  </Badge>
                </InlineStack>
                <Text variant="bodyMd" tone="subdued">
                  Current Plan: <strong>{currentPlanInfo.name}</strong> • Plan Limit: <strong>{dynamicTierInfo.subscribedLimit.toLocaleString()} Max</strong>
                </Text>
              </BlockStack>

              <div style={{ textAlign: "right" }}>
                <Text variant="headingXl" as="p">
                  {totalImpressions.toLocaleString()}{" "}
                  <Text variant="bodyMd" tone="subdued" as="span">
                    / {dynamicTierInfo.targetLimit.toLocaleString()}
                  </Text>
                </Text>
                <Text variant="bodySm" fontWeight="bold" tone={isCapExceeded ? "critical" : dynamicTierInfo.progressPercent > 80 ? "caution" : "success"}>
                  {dynamicTierInfo.progressPercent}% capacity
                </Text>
              </div>
            </InlineStack>

            {/* Custom High-Visibility Progress Loader Bar */}
            <div
              style={{
                width: "100%",
                height: "14px",
                backgroundColor: "#E2E8F0",
                borderRadius: "7px",
                overflow: "hidden",
                boxShadow: "inset 0 1px 3px rgba(0,0,0,0.1)",
                position: "relative",
              }}
            >
              <div
                style={{
                  width: `${Math.max(2, dynamicTierInfo.progressPercent)}%`,
                  height: "100%",
                  backgroundColor: isCapExceeded
                    ? "#EF4444"
                    : dynamicTierInfo.progressPercent > 80
                    ? "#F59E0B"
                    : "#4F46E5",
                  background: isCapExceeded
                    ? "linear-gradient(90deg, #EF4444 0%, #DC2626 100%)"
                    : dynamicTierInfo.progressPercent > 80
                    ? "linear-gradient(90deg, #F59E0B 0%, #D97706 100%)"
                    : "linear-gradient(90deg, #4F46E5 0%, #6366F1 100%)",
                  borderRadius: "7px",
                  transition: "width 0.5s ease-in-out",
                }}
              />
            </div>

            {/* Visual Milestone Progression Steps */}
            <Box padding="300" background="bg-surface-secondary" borderRadius="200">
              <BlockStack gap="200">
                <Text variant="bodySm" fontWeight="semibold" tone="subdued">
                  Dynamic Package Milestones:
                </Text>
                <InlineStack gap="200" wrap>
                  {(dynamicTierInfo.tierChain || []).map((step) => {
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

            {/* 1-Click Instant Upgrade Action Directly Under Loader */}
            {nextPlanKey && (
              <Box
                padding="300"
                background={isCapExceeded ? "bg-surface-critical" : "bg-surface-secondary"}
                borderRadius="200"
                borderWidth="025"
                borderColor={isCapExceeded ? "border-critical" : "border"}
              >
                <InlineStack align="space-between" blockAlign="center" wrap>
                  <BlockStack gap="050">
                    <Text variant="headingSm" fontWeight="bold">
                      {isCapExceeded
                        ? `🚨 Pop-Up Paused — Upgrade to ${nextPlanInfo.name} to Reactivate`
                        : `Ready for more volume? Upgrade to ${nextPlanInfo.name}`}
                    </Text>
                    <Text variant="bodySm" tone="subdued">
                      Includes <strong>{nextPlanInfo.monthlyImpressions.toLocaleString()} monthly impressions</strong> for only <strong>${nextPlanInfo.price.toFixed(2)}/mo</strong>. Direct 1-click Shopify approval.
                    </Text>
                  </BlockStack>

                  <InlineStack gap="200" blockAlign="center">
                    <Button
                      variant="primary"
                      tone={isCapExceeded ? "critical" : undefined}
                      loading={isUpgrading}
                      onClick={() => handleInstantUpgrade(nextPlanKey)}
                    >
                      {isCapExceeded
                        ? `⚡ 1-Click Reactivate ($${nextPlanInfo.price.toFixed(2)}/mo)`
                        : `⚡ Upgrade to ${nextPlanInfo.name} ($${nextPlanInfo.price.toFixed(2)}/mo)`}
                    </Button>
                    <Button variant="plain" onClick={() => navigate("/app/billing")}>
                      View All 5 Plans
                    </Button>
                  </InlineStack>
                </InlineStack>
              </Box>
            )}

            <InlineStack align="space-between">
              <Text variant="bodySm" tone="subdued">
                Billing Cycle Reset: 30-day rolling cycle
              </Text>
              <Button variant="plain" onClick={() => navigate("/app/billing")}>
                Manage Subscription & Billing
              </Button>
            </InlineStack>
          </BlockStack>
        </Card>

        {/* Modal Popup for Instant Upgrade when Cap is Reached */}
        {showUpgradeModal && nextPlanInfo && (
          <Modal
            open={showUpgradeModal}
            onClose={() => setShowUpgradeModal(false)}
            title="⚠️ Monthly Free Limit Reached — Spin Wheel Paused"
            primaryAction={{
              content: `⚡ Upgrade to ${nextPlanInfo.name} ($${nextPlanInfo.price.toFixed(2)}/mo)`,
              loading: isUpgrading,
              onAction: () => handleInstantUpgrade(nextPlanKey),
            }}
            secondaryActions={[
              {
                content: "View All 5 Plans",
                onAction: () => {
                  setShowUpgradeModal(false);
                  navigate("/app/billing");
                },
              },
              {
                content: "Dismiss",
                onAction: () => setShowUpgradeModal(false),
              },
            ]}
          >
            <Modal.Section>
              <BlockStack gap="400">
                <Banner status="critical">
                  Your store has logged <strong>{totalImpressions.toLocaleString()} / {dynamicTierInfo.subscribedLimit.toLocaleString()}</strong> impressions this month. The spin wheel pop-up is currently <strong>paused</strong> on your storefront to protect your store from surprise fees.
                </Banner>
                <Card padding="400">
                  <BlockStack gap="300">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text variant="headingMd">{nextPlanInfo.name}</Text>
                      <Badge tone="success">Instant Reactivation</Badge>
                    </InlineStack>
                    <div>
                      <Text variant="heading2xl" as="span">
                        ${nextPlanInfo.price.toFixed(2)}
                      </Text>
                      <Text variant="bodySm" tone="subdued" as="span">
                        {" "}/ month
                      </Text>
                    </div>
                    <Text variant="bodySm" tone="subdued">
                      {nextPlanInfo.description}
                    </Text>
                    <BlockStack gap="100">
                      {(nextPlanInfo.features || []).map((feat, idx) => (
                        <InlineStack key={idx} gap="150" blockAlign="center">
                          <span style={{ color: "#10B981", fontSize: "14px" }}>✓</span>
                          <Text variant="bodySm" as="span">{feat}</Text>
                        </InlineStack>
                      ))}
                    </BlockStack>
                  </BlockStack>
                </Card>
              </BlockStack>
            </Modal.Section>
          </Modal>
        )}

        {/* KPI Grid */}
        <Grid>
          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
            <Card padding="400">
              <BlockStack gap="200">
                <Text tone="subdued" variant="bodyMd">Total Impressions</Text>
                <Text variant="headingLg" as="p">{totalImpressions.toLocaleString()}</Text>
                <Badge tone="info">Storefront Views</Badge>
              </BlockStack>
            </Card>
          </Grid.Cell>

          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
            <Card padding="400">
              <BlockStack gap="200">
                <Text tone="subdued" variant="bodyMd">Total Leads Collected</Text>
                <Text variant="headingLg" as="p">{totalLeads.toLocaleString()}</Text>
                <Badge tone="success">+ Email & SMS</Badge>
              </BlockStack>
            </Card>
          </Grid.Cell>

          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
            <Card padding="400">
              <BlockStack gap="200">
                <Text tone="subdued" variant="bodyMd">Opt-in Conversion Rate</Text>
                <Text variant="headingLg" as="p">{optInRate}%</Text>
                <Badge tone="attention">High Conversion</Badge>
              </BlockStack>
            </Card>
          </Grid.Cell>

          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
            <Card padding="400">
              <BlockStack gap="200">
                <Text tone="subdued" variant="bodyMd">Est. Generated Revenue</Text>
                <Text variant="headingLg" as="p">${estimatedRevenue}</Text>
                <Badge tone="success">Attributed Sales</Badge>
              </BlockStack>
            </Card>
          </Grid.Cell>
        </Grid>

        {/* Active Campaigns Overview & Recent Leads */}
        <Layout>
          <Layout.Section variant="oneHalf">
            <Card padding="500">
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text variant="headingMd" as="h2">Active Campaigns ({(activeCampaigns || []).length})</Text>
                  <Button variant="secondary" onClick={() => navigate("/app/campaigns")}>Manage All</Button>
                </InlineStack>

                {(!activeCampaigns || activeCampaigns.length === 0) ? (
                  <BlockStack gap="200" align="center">
                    <Text tone="subdued">No active spin wheel campaign found.</Text>
                    <Button variant="primary" onClick={() => navigate("/app/campaigns/new")}>
                      Create Your First Wheel Campaign
                    </Button>
                  </BlockStack>
                ) : (
                  <BlockStack gap="300">
                    {activeCampaigns.map((camp) => (
                      <Card key={camp.id} padding="300" background="bg-surface-secondary">
                        <InlineStack align="space-between" blockAlign="center">
                          <BlockStack gap="100">
                            <InlineStack gap="200" blockAlign="center">
                              <Text variant="headingSm">{camp.name}</Text>
                              <Badge tone={camp.status === "ACTIVE" ? "success" : "info"}>{camp.status}</Badge>
                              {camp.type === "EMBED" ? <Badge>Inline Embed</Badge> : <Badge tone="attention">Popup Modal</Badge>}
                            </InlineStack>
                            <Text variant="bodySm" tone="subdued">
                              {camp.segments.length} segments • {camp._count.leads} wins
                            </Text>
                          </BlockStack>
                          <Button size="slim" onClick={() => navigate(`/app/campaigns/${camp.id}`)}>Edit Wheel</Button>
                        </InlineStack>
                      </Card>
                    ))}
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneHalf">
            <Card padding="500">
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text variant="headingMd" as="h2">Recent Won Leads</Text>
                  <Button variant="plain" onClick={() => navigate("/app/leads")}>View All Leads</Button>
                </InlineStack>

                {(!recentLeads || recentLeads.length === 0) ? (
                  <Text tone="subdued">No leads collected yet. Spins on your store will show up here.</Text>
                ) : (
                  <DataTable
                    columnContentTypes={["text", "text", "text", "text"]}
                    headings={["Contact", "Won Prize", "Discount Code", "Date"]}
                    rows={leadRows}
                  />
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
