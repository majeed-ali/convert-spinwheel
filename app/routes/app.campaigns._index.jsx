import { useLoaderData, useSubmit, useNavigate } from "react-router";
import {
  Page,
  Card,
  ResourceList,
  ResourceItem,
  Text,
  Badge,
  Button,
  InlineStack,
  BlockStack,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await prisma.shop.findUnique({ where: { shopifyDomain: session.shop } });

  if (!shop) {
    return JSON.parse(JSON.stringify({ campaigns: [] }));
  }

  const campaigns = await prisma.campaign.findMany({
    where: { shopId: shop.id },
    include: {
      segments: true,
      _count: { select: { leads: true, impressionLogs: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return JSON.parse(JSON.stringify({ campaigns }));
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const campaignId = formData.get("campaignId");

  if (intent === "toggle_status") {
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (campaign) {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: campaign.status === "ACTIVE" ? "DRAFT" : "ACTIVE" },
      });
    }
  } else if (intent === "delete") {
    await prisma.campaign.delete({ where: { id: campaignId } });
  }

  return Response.json({ success: true });
};

export default function CampaignsList() {
  const { campaigns = [] } = useLoaderData() || {};
  const submit = useSubmit();
  const navigate = useNavigate();

  const handleToggleStatus = (id) => {
    submit({ intent: "toggle_status", campaignId: id }, { method: "post" });
  };

  const handleDelete = (id) => {
    if (confirm("Are you sure you want to delete this spin wheel campaign?")) {
      submit({ intent: "delete", campaignId: id }, { method: "post" });
    }
  };

  return (
    <Page
      title="Spin Wheel Campaigns"
      subtitle="Configure popup overlays, embedded inline wheels, and smart triggers."
      primaryAction={{
        content: "Create New Campaign",
        onAction: () => navigate("/app/campaigns/new"),
      }}
    >
      <BlockStack gap="500">
        <Card padding="0">
          <ResourceList
            resourceName={{ singular: "campaign", plural: "campaigns" }}
            items={campaigns}
            renderItem={(item) => {
              const { id, name, type, status, isABTest, segments = [], _count = { leads: 0 }, createdAt } = item;
              return (
                <ResourceItem id={id} accessibilityLabel={`View details for ${name}`}>
                  <InlineStack align="space-between" blockAlign="center" wrap={false}>
                    <BlockStack gap="200">
                      <InlineStack gap="200" blockAlign="center">
                        <Text variant="headingMd" as="h3">{name}</Text>
                        <Badge tone={status === "ACTIVE" ? "success" : "info"}>{status}</Badge>
                        <Badge tone="attention">{type === "EMBED" ? "Inline Embed" : "Popup Overlay"}</Badge>
                        {isABTest && <Badge tone="warning">A/B Test Enabled</Badge>}
                      </InlineStack>

                      <Text variant="bodySm" tone="subdued">
                        {segments.length} Wheel Slices • {_count.leads} Leads Collected • Created {new Date(createdAt).toLocaleDateString()}
                      </Text>
                    </BlockStack>

                    <InlineStack gap="200">
                      <Button size="slim" onClick={() => handleToggleStatus(id)}>
                        {status === "ACTIVE" ? "Deactivate" : "Activate"}
                      </Button>
                      <Button size="slim" variant="secondary" onClick={() => navigate(`/app/campaigns/${id}`)}>
                        Edit Wheel
                      </Button>
                      <Button size="slim" tone="critical" onClick={() => handleDelete(id)}>
                        Delete
                      </Button>
                    </InlineStack>
                  </InlineStack>
                </ResourceItem>
              );
            }}
          />
        </Card>
      </BlockStack>
    </Page>
  );
}
