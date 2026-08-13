import { useState } from "react";
import { useLoaderData, useSubmit, useActionData } from "react-router";
import { Page, Card, TextField, Button, Banner, BlockStack, InlineStack, Text, Badge } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getOrInitShop } from "../services/billing.server";
import { syncLeadToIntegrations } from "../services/integrations.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrInitShop(session.shop, session.accessToken);

  return JSON.parse(JSON.stringify({ shop }));
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const intent = formData.get("intent");
  const klaviyoApiKey = formData.get("klaviyoApiKey")?.toString().trim() || null;
  const mailchimpApiKey = formData.get("mailchimpApiKey")?.toString().trim() || null;
  const sendgridApiKey = formData.get("sendgridApiKey")?.toString().trim() || null;

  await prisma.shop.updateMany({
    where: { shopifyDomain: session.shop },
    data: {
      klaviyoApiKey,
      mailchimpApiKey,
      sendgridApiKey,
    },
  });

  const updatedShop = await prisma.shop.findUnique({ where: { shopifyDomain: session.shop } });

  let testResults = null;
  if (intent === "test") {
    testResults = await syncLeadToIntegrations(updatedShop, {
      email: `test_spinwheel_${Date.now()}@example.com`,
      wonCode: "TEST10OFF",
      wonDiscountLabel: "10% OFF Test",
    });
  }

  return Response.json({
    success: true,
    message: intent === "test" ? "Integration settings saved & live test triggered!" : "Integrations settings saved successfully!",
    testResults,
  });
};

export default function SettingsPage() {
  const { shop } = useLoaderData();
  const actionData = useActionData();
  const submit = useSubmit();

  const [klaviyoApiKey, setKlaviyoApiKey] = useState(shop.klaviyoApiKey || "");
  const [mailchimpApiKey, setMailchimpApiKey] = useState(shop.mailchimpApiKey || "");
  const [sendgridApiKey, setSendgridApiKey] = useState(shop.sendgridApiKey || "");

  const handleSave = (intent = "save") => {
    const formData = new FormData();
    formData.append("intent", intent);
    formData.append("klaviyoApiKey", klaviyoApiKey);
    formData.append("mailchimpApiKey", mailchimpApiKey);
    formData.append("sendgridApiKey", sendgridApiKey);

    submit(formData, { method: "post" });
  };

  const testResults = actionData?.testResults;

  return (
    <Page title="Email & CRM Integrations" subtitle="Connect your marketing automation platforms for instant lead sync upon wheel spins.">
      <BlockStack gap="500">
        {actionData?.success && (
          <Banner status="success">
            {actionData.message}
          </Banner>
        )}

        {testResults && (
          <Banner title="Live Integration Test Results" status="info">
            <BlockStack gap="200">
              {testResults.klaviyo && (
                <Text as="p">
                  <strong>Klaviyo:</strong> {testResults.klaviyo.success ? "✅ " : "❌ "} {testResults.klaviyo.message}
                </Text>
              )}
              {testResults.mailchimp && (
                <Text as="p">
                  <strong>Mailchimp:</strong> {testResults.mailchimp.success ? "✅ " : "❌ "} {testResults.mailchimp.message}
                </Text>
              )}
              {testResults.sendgrid && (
                <Text as="p">
                  <strong>SendGrid:</strong> {testResults.sendgrid.success ? "✅ " : "❌ "} {testResults.sendgrid.message}
                </Text>
              )}
            </BlockStack>
          </Banner>
        )}

        <Card padding="500">
          <BlockStack gap="400">
            <InlineStack align="space-between">
              <Text variant="headingMd">Klaviyo Integration</Text>
              <Badge tone={klaviyoApiKey ? "success" : "subdued"}>{klaviyoApiKey ? "Connected" : "Not Configured"}</Badge>
            </InlineStack>
            <TextField
              label="Klaviyo Private API Key (pk_...)"
              value={klaviyoApiKey}
              onChange={setKlaviyoApiKey}
              type="password"
              autoComplete="off"
              helpText="Find this in Klaviyo Settings > API Keys > Create Private API Key (Must have Profiles & Lists write access)"
            />
          </BlockStack>
        </Card>

        <Card padding="500">
          <BlockStack gap="400">
            <InlineStack align="space-between">
              <Text variant="headingMd">Mailchimp Integration</Text>
              <Badge tone={mailchimpApiKey ? "success" : "subdued"}>{mailchimpApiKey ? "Connected" : "Not Configured"}</Badge>
            </InlineStack>
            <TextField
              label="Mailchimp API Key (xxxx-usX)"
              value={mailchimpApiKey}
              onChange={setMailchimpApiKey}
              type="password"
              autoComplete="off"
              helpText="Find this in Mailchimp Account Settings > Extras > API Keys (e.g. 1234567890abcdef-us11)"
            />
          </BlockStack>
        </Card>

        <Card padding="500">
          <BlockStack gap="400">
            <InlineStack align="space-between">
              <Text variant="headingMd">SendGrid Integration</Text>
              <Badge tone={sendgridApiKey ? "success" : "subdued"}>{sendgridApiKey ? "Connected" : "Not Configured"}</Badge>
            </InlineStack>
            <TextField
              label="SendGrid API Key (SG....)"
              value={sendgridApiKey}
              onChange={setSendgridApiKey}
              type="password"
              autoComplete="off"
              helpText="Find this in SendGrid Settings > API Keys"
            />
          </BlockStack>
        </Card>

        <InlineStack align="end" gap="300">
          <Button onClick={() => handleSave("test")} loading={false}>
            Save & Test Sync
          </Button>
          <Button variant="primary" onClick={() => handleSave("save")}>
            Save Settings
          </Button>
        </InlineStack>
      </BlockStack>
    </Page>
  );
}
