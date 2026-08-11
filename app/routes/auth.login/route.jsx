import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { useState } from "react";
import { Form, useActionData, useLoaderData } from "react-router";
import { login } from "../../shopify.server";
import { loginErrorMessage } from "./error.server";
import { Page, Card, Text, BlockStack, Banner, Button } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }) => {
  const errors = loginErrorMessage(await login(request));
  return { errors };
};

export const action = async ({ request }) => {
  const errors = loginErrorMessage(await login(request));
  return { errors };
};

export default function Auth() {
  const loaderData = useLoaderData();
  const actionData = useActionData();
  const [shop, setShop] = useState("");
  const { errors } = actionData || loaderData;

  return (
    <AppProvider embedded={false}>
      <Page title="Convert Spin App Authentication">
        <BlockStack gap="400">
          <Banner title="Shopify Admin Authentication Required" status="info">
            <Text as="p">
              This app is integrated directly with Shopify. Please install or open <strong>Convert Spin</strong> from your <strong>Shopify Admin Dashboard</strong> or the <strong>Shopify App Store</strong>.
            </Text>
          </Banner>

          {/* Fallback query launcher if shop parameter is provided */}
          {errors?.shop && (
            <Card padding="400">
              <Form method="post">
                <BlockStack gap="300">
                  <Text variant="headingMd" as="h2">Dev Store Direct Authentication</Text>
                  <Text variant="bodyMd">
                    To authenticate a development store directly, pass the shop query parameter (e.g. <code>?shop=your-store.myshopify.com</code>) or submit below:
                  </Text>
                  <input
                    type="hidden"
                    name="shop"
                    value={shop}
                  />
                </BlockStack>
              </Form>
            </Card>
          )}
        </BlockStack>
      </Page>
    </AppProvider>
  );
}
