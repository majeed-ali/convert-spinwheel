import { useLoaderData } from "react-router";
import {
  Page,
  Layout,
  Card,
  Text,
  Badge,
  DataTable,
  BlockStack,
  InlineStack,
  ProgressBar,
  Grid,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { PLAN_TIERS } from "../services/plans";

export const loader = async ({ request }) => {
  await authenticate.admin(request);

  // Fetch all registered shops
  const allShops = await prisma.shop.findMany({
    include: {
      _count: {
        select: { campaigns: true, leads: true, impressionLogs: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const totalStores = allShops.length;

  let freeStores = 0;
  let basicStores = 0;
  let advancedStores = 0;
  let totalImpressionsMonth = 0;
  let totalLeadsCaptured = 0;

  allShops.forEach((shop) => {
    totalImpressionsMonth += shop.monthlyImpressionsCount || 0;
    totalLeadsCaptured += shop._count.leads || 0;

    if (shop.currentPlan === "BASIC") basicStores++;
    else if (shop.currentPlan === "ADVANCED") advancedStores++;
    else freeStores++;
  });

  // Calculate MRR (Monthly Recurring Revenue)
  const mrr = (basicStores * 9.99 + advancedStores * 29.99).toFixed(2);
  const arr = (parseFloat(mrr) * 12).toFixed(2);

  // Total impressions in database logs
  const totalAllTimeImpressions = await prisma.impressionLog.count();

  return JSON.parse(
    JSON.stringify({
      allShops,
      totalStores,
      freeStores,
      basicStores,
      advancedStores,
      mrr,
      arr,
      totalImpressionsMonth,
      totalAllTimeImpressions,
      totalLeadsCaptured,
    })
  );
};

export default function DeveloperAnalytics() {
  const {
    allShops = [],
    totalStores = 0,
    freeStores = 0,
    basicStores = 0,
    advancedStores = 0,
    mrr = "0.00",
    arr = "0.00",
    totalImpressionsMonth = 0,
    totalAllTimeImpressions = 0,
    totalLeadsCaptured = 0,
  } = useLoaderData() || {};

  const shopRows = (allShops || []).map((s) => {
    const planInfo = PLAN_TIERS[s.currentPlan] || PLAN_TIERS.FREE;
    const limit = planInfo.monthlyImpressions || 300;
    const count = s.monthlyImpressionsCount || 0;
    const progress = Math.min(100, Math.round((count / limit) * 100));

    let planBadge = <Badge tone="info">FREE</Badge>;
    if (s.currentPlan === "BASIC") planBadge = <Badge tone="success">BASIC ($9.99/mo)</Badge>;
    if (s.currentPlan === "ADVANCED") planBadge = <Badge tone="attention">ADVANCED ($29.99/mo)</Badge>;

    return [
      <Text key={s.id} variant="bodyMd" fontWeight="bold">{s.shopifyDomain}</Text>,
      planBadge,
      <BlockStack key={`imp_${s.id}`} gap="100">
        <Text variant="bodySm">{count.toLocaleString()} / {limit.toLocaleString()} ({progress}%)</Text>
        <ProgressBar progress={progress} size="small" tone={progress >= 100 ? "critical" : "highlight"} />
      </BlockStack>,
      s._count?.leads?.toLocaleString() || "0",
      s.createdAt ? new Date(s.createdAt).toLocaleDateString() : "-",
    ];
  });

  return (
    <Page
      title="Developer & App Owner Analytics"
      subtitle="Overview of Active Store Installations, Plan Subscriptions, Revenue (MRR), and Traffic Usage"
    >
      <BlockStack gap="500">
        {/* KPI Cards Header */}
        <Grid>
          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
            <Card padding="400">
              <BlockStack gap="100">
                <Text variant="bodyMd" tone="subdued">Est. Monthly Revenue (MRR)</Text>
                <Text variant="headingXl" fontWeight="bold" tone="success">${mrr} / mo</Text>
                <Text variant="bodyXs" tone="subdued">Projected ARR: ${arr} / yr</Text>
              </BlockStack>
            </Card>
          </Grid.Cell>

          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
            <Card padding="400">
              <BlockStack gap="100">
                <Text variant="bodyMd" tone="subdued">Active Installed Stores</Text>
                <Text variant="headingXl" fontWeight="bold">{totalStores}</Text>
                <InlineStack gap="200">
                  <Badge tone="info">{freeStores} Free</Badge>
                  <Badge tone="success">{basicStores + advancedStores} Paid</Badge>
                </InlineStack>
              </BlockStack>
            </Card>
          </Grid.Cell>

          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
            <Card padding="400">
              <BlockStack gap="100">
                <Text variant="bodyMd" tone="subdued">Monthly Platform Impressions</Text>
                <Text variant="headingXl" fontWeight="bold">{totalImpressionsMonth.toLocaleString()}</Text>
                <Text variant="bodyXs" tone="subdued">All-time logs: {totalAllTimeImpressions.toLocaleString()}</Text>
              </BlockStack>
            </Card>
          </Grid.Cell>

          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
            <Card padding="400">
              <BlockStack gap="100">
                <Text variant="bodyMd" tone="subdued">Total Leads Collected</Text>
                <Text variant="headingXl" fontWeight="bold">{totalLeadsCaptured.toLocaleString()}</Text>
                <Text variant="bodyXs" tone="subdued">Emails & Phones Captured</Text>
              </BlockStack>
            </Card>
          </Grid.Cell>
        </Grid>

        {/* Plan Distribution Breakdown */}
        <Card padding="500">
          <BlockStack gap="300">
            <Text variant="headingMd">Subscription Plan Breakdown</Text>
            <Grid>
              <Grid.Cell columnSpan={{ xs: 4, sm: 4, md: 4, lg: 4, xl: 4 }}>
                <BlockStack gap="100" align="center">
                  <Text variant="bodyMd" fontWeight="bold">Free Tier ($0/mo)</Text>
                  <Text variant="headingLg">{freeStores} Stores</Text>
                  <Text variant="bodyXs" tone="subdued">Cap: 300 impressions/mo</Text>
                </BlockStack>
              </Grid.Cell>

              <Grid.Cell columnSpan={{ xs: 4, sm: 4, md: 4, lg: 4, xl: 4 }}>
                <BlockStack gap="100" align="center">
                  <Text variant="bodyMd" fontWeight="bold" tone="success">Basic Tier ($9.99/mo)</Text>
                  <Text variant="headingLg">{basicStores} Stores</Text>
                  <Text variant="bodyXs" tone="subdued">Cap: 10,000 impressions/mo</Text>
                </BlockStack>
              </Grid.Cell>

              <Grid.Cell columnSpan={{ xs: 4, sm: 4, md: 4, lg: 4, xl: 4 }}>
                <BlockStack gap="100" align="center">
                  <Text variant="bodyMd" fontWeight="bold" tone="attention">Advanced Tier ($29.99/mo)</Text>
                  <Text variant="headingLg">{advancedStores} Stores</Text>
                  <Text variant="bodyXs" tone="subdued">Cap: 50,000+ impressions/mo</Text>
                </BlockStack>
              </Grid.Cell>
            </Grid>
          </BlockStack>
        </Card>

        {/* Installed Stores Table */}
        <Card padding="0">
          <BlockStack gap="300">
            <div style={{ padding: "16px 20px 0 20px" }}>
              <Text variant="headingMd">Active Merchant Stores Directory ({totalStores})</Text>
            </div>
            <DataTable
              columnContentTypes={["text", "text", "text", "numeric", "text"]}
              headings={["Shop Domain", "Current Plan", "Monthly Impressions Usage", "Leads Collected", "Install Date"]}
              rows={shopRows}
              emptyState={
                <div style={{ textAlign: "center", padding: "40px 20px" }}>
                  <Text tone="subdued">No store installations recorded yet.</Text>
                </div>
              }
            />
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
