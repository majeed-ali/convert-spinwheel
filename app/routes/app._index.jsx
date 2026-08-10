import { useLoaderData, useNavigate } from "react-router";
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
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getOrInitShop } from "../services/billing.server";
import { PLAN_TIERS } from "../services/plans";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrInitShop(session.shop, session.accessToken);

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

  const totalImpressions = shop.monthlyImpressionsCount;
  const optInRate = totalImpressions > 0 ? ((totalLeads / totalImpressions) * 100).toFixed(1) : "0.0";
  
  // Calculate converted revenue estimation ($25 average order value per redemption assumption)
  const estimatedRevenue = (totalLeads * 25 * 0.35).toFixed(2);

  const recentLeads = await prisma.lead.findMany({
    where: { shopId: shop.id },
    take: 5,
    orderBy: { convertedAt: "desc" },
  });

  const currentPlanInfo = PLAN_TIERS[shop.currentPlan] || PLAN_TIERS.FREE;
  const isCapExceeded = !currentPlanInfo.isOverageAllowed && totalImpressions >= currentPlanInfo.monthlyImpressions;

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
      isCapExceeded,
    })
  );
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
    isCapExceeded = false,
  } = useLoaderData() || {};
  const navigate = useNavigate();

  const progressPercent = Math.min(
    100,
    Math.round((totalImpressions / (currentPlanInfo.monthlyImpressions || 300)) * 100)
  );

  const leadRows = (recentLeads || []).map((lead) => [
    lead.email || lead.phone || "Anonymous",
    lead.wonDiscountLabel || lead.wonCode || "-",
    lead.wonCode || "-",
    new Date(lead.convertedAt).toLocaleDateString(),
  ]);

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

        {isCapExceeded && (
          <Banner
            title="Monthly Impression Limit Exceeded"
            status="warning"
            action={{ content: "Upgrade Plan", onAction: () => navigate("/app/billing") }}
          >
            <p>
              Your store has reached <strong>{totalImpressions}</strong> / {currentPlanInfo.monthlyImpressions} impressions on the {currentPlanInfo.name}. Upgrade your plan to keep collecting leads!
            </p>
          </Banner>
        )}

        {/* Impression Tier Meter */}
        <Card padding="500">
          <BlockStack gap="300">
            <InlineStack align="space-between">
              <Text variant="headingMd" as="h2">Monthly Impression Usage ({currentPlanInfo.name})</Text>
              <Badge tone={isCapExceeded ? "critical" : "success"}>
                {totalImpressions} / {currentPlanInfo.isOverageAllowed ? "Unlimited (50k Base)" : `${currentPlanInfo.monthlyImpressions} Max`}
              </Badge>
            </InlineStack>

            <ProgressBar
              progress={currentPlanInfo.isOverageAllowed ? Math.min(100, (totalImpressions / 50000) * 100) : progressPercent}
              tone={isCapExceeded ? "critical" : progressPercent > 85 ? "warning" : "primary"}
            />

            <InlineStack align="space-between">
              <Text variant="bodySm" tone="subdued">
                Billing Cycle Reset: 30-day rolling cycle
              </Text>
              <Button variant="plain" onClick={() => navigate("/app/billing")}>
                View Billing & Tier Options
              </Button>
            </InlineStack>
          </BlockStack>
        </Card>

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
