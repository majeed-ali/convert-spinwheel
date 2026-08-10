import { useState } from "react";
import { useLoaderData, useSubmit } from "react-router";
import { Page, Card, TextField, Button, Banner, BlockStack, InlineStack, Text, Badge } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getOrInitShop } from "../services/billing.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrInitShop(session.shop, session.accessToken);

  return JSON.parse(JSON.stringify({ shop }));
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const klaviyoApiKey = formData.get("klaviyoApiKey");
  const mailchimpApiKey = formData.get("mailchimpApiKey");
  const sendgridApiKey = formData.get("sendgridApiKey");

  await prisma.shop.updateMany({
    where: { shopifyDomain: session.shop },
    data: {
      klaviyoApiKey: klaviyoApiKey || null,
      mailchimpApiKey: mailchimpApiKey || null,
      sendgridApiKey: sendgridApiKey || null,
    },
  });

  return Response.json({ success: true, message: "Integrations settings updated!" });
};

export default function SettingsPage() {
  const { shop } = useLoaderData();
  const submit = useSubmit();

  const [klaviyoApiKey, setKlaviyoApiKey] = useState(shop.klaviyoApiKey || "");
  const [mailchimpApiKey, setMailchimpApiKey] = useState(shop.mailchimpApiKey || "");
  const [sendgridApiKey, setSendgridApiKey] = useState(shop.sendgridApiKey || "");
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSave = () => {
    const formData = new FormData();
    formData.append("klaviyoApiKey", klaviyoApiKey);
    formData.append("mailchimpApiKey", mailchimpApiKey);
    formData.append("sendgridApiKey", sendgridApiKey);

    submit(formData, { method: "post" });
    setSavedSuccess(true);
  };

  return (
    <Page title="Email & CRM Integrations" subtitle="Connect your marketing automation platforms for instant lead sync upon wheel spins.">
      <BlockStack gap="500">
        {savedSuccess && (
          <Banner status="success" onDismiss={() => setSavedSuccess(false)}>
            API keys saved successfully.
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
              helpText="Find this in Klaviyo Settings > API Keys > Create Private API Key"
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
              helpText="Find this in Mailchimp Account Settings > Extras > API Keys"
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

        <InlineStack align="end">
          <Button variant="primary" onClick={handleSave}>
            Save Integration Settings
          </Button>
        </InlineStack>
      </BlockStack>
    </Page>
  );
}
