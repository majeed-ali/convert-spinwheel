import { useLoaderData } from "react-router";
import { Page, Card, DataTable, Text, Button, InlineStack, BlockStack } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await prisma.shop.findUnique({ where: { shopifyDomain: session.shop } });

  if (!shop) {
    return JSON.parse(JSON.stringify({ leads: [] }));
  }

  const leads = await prisma.lead.findMany({
    where: { shopId: shop.id },
    orderBy: { convertedAt: "desc" },
    take: 500,
  });

  return JSON.parse(JSON.stringify({ leads }));
};

export default function LeadsPage() {
  const { leads } = useLoaderData();

  const exportCSV = () => {
    if (!leads.length) return;
    const headers = ["Email", "Phone", "Won Prize", "Discount Code", "IP Address", "Device", "Date"];
    const rows = leads.map((l) => [
      l.email || "",
      l.phone || "",
      l.wonDiscountLabel || "",
      l.wonCode || "",
      l.ipAddress || "",
      l.deviceType || "",
      new Date(l.convertedAt).toISOString(),
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.map((val) => `"${val}"`).join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `convert_spin_leads_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const rows = leads.map((l) => [
    l.email || "-",
    l.phone || "-",
    l.wonDiscountLabel || "-",
    l.wonCode || "-",
    l.deviceType || "desktop",
    new Date(l.convertedAt).toLocaleString(),
  ]);

  return (
    <Page
      title="Collected Leads & Opt-ins"
      subtitle={`Total Leads: ${leads.length}`}
      primaryAction={{
        content: "Export Leads CSV",
        onAction: exportCSV,
        disabled: leads.length === 0,
      }}
    >
      <BlockStack gap="500">
        <Card padding="0">
          {leads.length === 0 ? (
            <div style={{ padding: "30px", textAlign: "center" }}>
              <Text tone="subdued">No leads recorded yet. Spins on your storefront will populate here.</Text>
            </div>
          ) : (
            <DataTable
              columnContentTypes={["text", "text", "text", "text", "text", "text"]}
              headings={["Email", "Phone", "Won Prize", "Discount Code", "Device", "Date Won"]}
              rows={rows}
            />
          )}
        </Card>
      </BlockStack>
    </Page>
  );
}
