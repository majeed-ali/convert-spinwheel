import { useState } from "react";
import { useLoaderData, useSubmit, useNavigate, redirect } from "react-router";
import {
  Page,
  Layout,
  Card,
  Tabs,
  TextField,
  Select,
  Checkbox,
  Button,
  Banner,
  BlockStack,
  InlineStack,
  Text,
  Badge,
  Grid,
  Box,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getOrInitShop } from "../services/billing.server";

export const loader = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const { id } = params;

  if (id === "new") {
    const shop = await getOrInitShop(session.shop, session.accessToken);
    const newCampaign = await prisma.campaign.create({
      data: {
        shopId: shop.id,
        name: `Spin Wheel Campaign #${Math.floor(100 + Math.random() * 900)}`,
        type: "POPUP",
        status: "ACTIVE",
        isABTest: false,
        triggers: JSON.stringify({
          exitIntent: true,
          scrollDepth: 50,
          timeDelay: 5,
          pageUrlRules: [],
          cartValueMin: 0,
        }),
        themeSettings: JSON.stringify({
          title: "Spin & Win Exclusive Discount!",
          subtitle: "Enter your email for a chance to win up to 20% off!",
          buttonText: "Spin The Wheel Now",
          floatingLauncherText: "🎁 Spin to Win!",
          primaryColor: "#4F46E5",
          backgroundColor: "#FFFFFF",
          textColor: "#1F2937",
          requirePhone: false,
          gdprNotice: "By spinning, you agree to receive marketing updates.",
        }),
        segments: {
          create: [
            { label: "10% OFF", discountType: "PERCENTAGE", discountValue: "10", customCode: "", winProbability: 35, hexColor: "#EF4444", position: 0 },
            { label: "15% OFF", discountType: "PERCENTAGE", discountValue: "15", customCode: "", winProbability: 25, hexColor: "#3B82F6", position: 1 },
            { label: "$5 OFF", discountType: "FIXED_AMOUNT", discountValue: "5", customCode: "", winProbability: 20, hexColor: "#10B981", position: 2 },
            { label: "FREE SHIPPING", discountType: "FREE_SHIPPING", discountValue: "0", customCode: "", winProbability: 10, hexColor: "#F59E0B", position: 3 },
            { label: "20% OFF", discountType: "PERCENTAGE", discountValue: "20", customCode: "", winProbability: 5, hexColor: "#8B5CF6", position: 4 },
            { label: "TRY AGAIN", discountType: "TRY_AGAIN", discountValue: "0", customCode: "", winProbability: 5, hexColor: "#6B7280", position: 5 },
          ],
        },
      },
    });

    return redirect(`/app/campaigns/${newCampaign.id}`);
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: {
      segments: {
        orderBy: { position: "asc" },
      },
    },
  });

  if (!campaign) {
    throw new Response("Campaign Not Found", { status: 404 });
  }

  const triggers = typeof campaign.triggers === "string" ? JSON.parse(campaign.triggers || "{}") : campaign.triggers;
  const themeSettings = typeof campaign.themeSettings === "string" ? JSON.parse(campaign.themeSettings || "{}") : campaign.themeSettings;

  return JSON.parse(JSON.stringify({ campaign, triggers, themeSettings }));
};

export const action = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const { id } = params;
  const formData = await request.formData();

  const name = formData.get("name");
  const type = formData.get("type");
  const status = formData.get("status");
  const triggersJson = formData.get("triggers");
  const themeSettingsJson = formData.get("themeSettings");
  const segmentsJson = formData.get("segments");

  const segmentsData = JSON.parse(segmentsJson || "[]");

  // Delete existing segments & recreate with customCode field
  await prisma.$transaction([
    prisma.campaign.update({
      where: { id },
      data: {
        name,
        type,
        status,
        triggers: triggersJson,
        themeSettings: themeSettingsJson,
      },
    }),
    prisma.wheelSegment.deleteMany({ where: { campaignId: id } }),
    prisma.wheelSegment.createMany({
      data: segmentsData.map((seg, idx) => ({
        campaignId: id,
        label: seg.label || `Slice ${idx + 1}`,
        discountType: seg.discountType || "PERCENTAGE",
        discountValue: seg.discountValue || "10",
        customCode: seg.customCode ? seg.customCode.trim() : "",
        winProbability: parseFloat(seg.winProbability) || 10,
        hexColor: seg.hexColor || "#3B82F6",
        position: idx,
      })),
    }),
  ]);

  return Response.json({ success: true, message: "Campaign saved successfully!" });
};

// SVG Wheel Renderer Helper Component
function SvgWheelPreview({ segments, primaryColor = "#4F46E5" }) {
  const numSlices = segments.length || 1;
  const sliceAngle = 360 / numSlices;
  const radius = 140;
  const center = 150;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", position: "relative" }}>
      <div style={{ position: "relative", width: "300px", height: "300px" }}>
        {/* Pointer Pin */}
        <div
          style={{
            position: "absolute",
            top: "-10px",
            left: "50%",
            transform: "translateX(-50%)",
            width: "0",
            height: "0",
            borderLeft: "15px solid transparent",
            borderRight: "15px solid transparent",
            borderTop: "25px solid #EF4444",
            zIndex: 10,
            filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.3))",
          }}
        />

        <svg width="300" height="300" viewBox="0 0 300 300">
          <circle cx={center} cy={center} r={radius + 5} fill="#1E293B" stroke="#F59E0B" strokeWidth="6" />
          {segments.map((seg, idx) => {
            const startDeg = idx * sliceAngle - 90;
            const endDeg = (idx + 1) * sliceAngle - 90;

            const startRad = (startDeg * Math.PI) / 180;
            const endRad = (endDeg * Math.PI) / 180;

            const x1 = center + radius * Math.cos(startRad);
            const y1 = center + radius * Math.sin(startRad);
            const x2 = center + radius * Math.cos(endRad);
            const y2 = center + radius * Math.sin(endRad);

            const largeArc = sliceAngle > 180 ? 1 : 0;
            const pathData = `M ${center} ${center} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;

            // Text position
            const textAngle = startDeg + sliceAngle / 2;
            const textRad = (textAngle * Math.PI) / 180;
            const textR = radius * 0.65;
            const textX = center + textR * Math.cos(textRad);
            const textY = center + textR * Math.sin(textRad);

            return (
              <g key={idx}>
                <path d={pathData} fill={seg.hexColor || "#3B82F6"} stroke="#FFFFFF" strokeWidth="2" />
                <text
                  x={textX}
                  y={textY}
                  fill="#FFFFFF"
                  fontSize="12"
                  fontWeight="bold"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  transform={`rotate(${textAngle + 90}, ${textX}, ${textY})`}
                >
                  {seg.label}
                </text>
              </g>
            );
          })}
          {/* Wheel Center Button */}
          <circle cx={center} cy={center} r="25" fill="#FFFFFF" stroke={primaryColor} strokeWidth="4" />
          <text x={center} y={center} fill={primaryColor} fontSize="10" fontWeight="bold" textAnchor="middle" dominantBaseline="middle">
            SPIN
          </text>
        </svg>
      </div>
    </div>
  );
}

export default function VisualWheelBuilder() {
  const { campaign, triggers: initialTriggers, themeSettings: initialTheme } = useLoaderData();
  const submit = useSubmit();
  const navigate = useNavigate();

  const [selectedTab, setSelectedTab] = useState(0);
  const [name, setName] = useState(campaign.name);
  const [type, setType] = useState(campaign.type);
  const [status, setStatus] = useState(campaign.status);

  // Segments State with customCode
  const [segments, setSegments] = useState(
    campaign.segments.length > 0
      ? campaign.segments
      : [
          { label: "10% OFF", discountType: "PERCENTAGE", discountValue: "10", customCode: "", winProbability: 40, hexColor: "#EF4444" },
          { label: "$5 OFF", discountType: "FIXED_AMOUNT", discountValue: "5", customCode: "", winProbability: 30, hexColor: "#3B82F6" },
          { label: "FREE SHIPPING", discountType: "FREE_SHIPPING", discountValue: "0", customCode: "", winProbability: 20, hexColor: "#10B981" },
          { label: "TRY AGAIN", discountType: "TRY_AGAIN", discountValue: "0", customCode: "", winProbability: 10, hexColor: "#6B7280" },
        ]
  );

  // Triggers State
  const [triggers, setTriggers] = useState({
    exitIntent: initialTriggers.exitIntent ?? true,
    scrollDepth: initialTriggers.scrollDepth ?? 50,
    timeDelay: initialTriggers.timeDelay ?? 5,
    recurrenceInterval: initialTriggers.recurrenceInterval ?? 15,
    pageUrlRules: initialTriggers.pageUrlRules ?? "",
    cartValueMin: initialTriggers.cartValueMin ?? 0,
  });

  // Appearance Settings
  const [theme, setTheme] = useState({
    title: initialTheme.title ?? "Spin & Win Exclusive Discount!",
    subtitle: initialTheme.subtitle ?? "Enter your email for a chance to win up to 20% off!",
    buttonText: initialTheme.buttonText ?? "Spin The Wheel Now",
    floatingLauncherText: initialTheme.floatingLauncherText ?? "🎁 Spin to Win!",
    launcherSvg: initialTheme.launcherSvg ?? "",
    primaryColor: initialTheme.primaryColor ?? "#4F46E5",
    backgroundColor: initialTheme.backgroundColor ?? "#FFFFFF",
    requirePhone: initialTheme.requirePhone ?? false,
    gdprNotice: initialTheme.gdprNotice ?? "By spinning, you agree to receive marketing updates.",
  });

  // Total probability check
  const totalProbability = segments.reduce((sum, s) => sum + (parseFloat(s.winProbability) || 0), 0);
  const isProbabilityValid = Math.abs(totalProbability - 100) < 0.1;

  const handleAddSegment = () => {
    if (segments.length >= 12) return;
    const colors = ["#EF4444", "#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899", "#14B8A6"];
    const randomColor = colors[segments.length % colors.length];
    setSegments([
      ...segments,
      {
        label: `Reward ${segments.length + 1}`,
        discountType: "PERCENTAGE",
        discountValue: "10",
        customCode: "",
        winProbability: 0,
        hexColor: randomColor,
      },
    ]);
  };

  const handleRemoveSegment = (index) => {
    if (segments.length <= 4) return;
    setSegments(segments.filter((_, idx) => idx !== index));
  };

  const handleSegmentChange = (index, field, value) => {
    const updated = [...segments];
    updated[index][field] = value;
    setSegments(updated);
  };

  const handleSave = () => {
    const formData = new FormData();
    formData.append("name", name);
    formData.append("type", type);
    formData.append("status", status);
    formData.append("triggers", JSON.stringify(triggers));
    formData.append("themeSettings", JSON.stringify(theme));
    formData.append("segments", JSON.stringify(segments));

    submit(formData, { method: "post" });
  };

  const tabs = [
    { id: "slices", content: "Wheel Slices & Coupon Codes (4-12)" },
    { id: "triggers", content: "Smart Triggers & Rules" },
    { id: "appearance", content: "Design & Copy" },
  ];

  return (
    <Page
      title={`Visual Wheel Builder: ${name}`}
      backAction={{ content: "Campaigns", onAction: () => navigate("/app/campaigns") }}
      primaryAction={{
        content: "Save Campaign",
        onAction: handleSave,
        disabled: !isProbabilityValid,
      }}
    >
      <BlockStack gap="500">
        {!isProbabilityValid && (
          <Banner title="Invalid Total Probability" status="warning">
            <p>
              The sum of win probabilities across all slices must equal <strong>100%</strong>. Currently: <strong>{totalProbability.toFixed(1)}%</strong>
            </p>
          </Banner>
        )}

        <Layout>
          {/* Left Column: Live Interactive Wheel Preview */}
          <Layout.Section variant="oneThird">
            <Card padding="500">
              <BlockStack gap="400" align="center">
                <Text variant="headingMd" as="h2">Live Interactive Preview</Text>
                <SvgWheelPreview segments={segments} primaryColor={theme.primaryColor} />

                <Box padding="300" background="bg-surface-secondary" borderRadius="200" width="100%">
                  <BlockStack gap="200">
                    <Text variant="headingSm">{theme.title}</Text>
                    <Text variant="bodySm" tone="subdued">{theme.subtitle}</Text>
                    <InlineStack gap="200">
                      <Badge tone={type === "EMBED" ? "attention" : "info"}>{type}</Badge>
                      <Badge tone={status === "ACTIVE" ? "success" : "subdued"}>{status}</Badge>
                    </InlineStack>
                  </BlockStack>
                </Box>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Right Column: Settings Tabs */}
          <Layout.Section variant="twoThirds">
            <Card padding="0">
              <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
                <Box padding="500">
                  {selectedTab === 0 && (
                    <BlockStack gap="400">
                      <InlineStack align="space-between" blockAlign="center">
                        <Text variant="headingMd">Configure Wheel Slices & Discounts ({segments.length}/12)</Text>
                        <Button onClick={handleAddSegment} disabled={segments.length >= 12}>
                          + Add Slice
                        </Button>
                      </InlineStack>

                      {segments.map((seg, idx) => (
                        <Card key={idx} padding="400" background="bg-surface-secondary">
                          <BlockStack gap="300">
                            <InlineStack align="space-between">
                              <Badge>Slice #{idx + 1}</Badge>
                              {segments.length > 4 && (
                                <Button size="slim" tone="critical" onClick={() => handleRemoveSegment(idx)}>
                                  Remove
                                </Button>
                              )}
                            </InlineStack>

                            <Grid>
                              <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4, xl: 4 }}>
                                <TextField
                                  label="Slice Label"
                                  value={seg.label}
                                  onChange={(val) => handleSegmentChange(idx, "label", val)}
                                  autoComplete="off"
                                />
                              </Grid.Cell>

                              <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4, xl: 4 }}>
                                <Select
                                  label="Discount Type"
                                  options={[
                                    { label: "Percentage OFF", value: "PERCENTAGE" },
                                    { label: "Fixed Amount OFF", value: "FIXED_AMOUNT" },
                                    { label: "Free Shipping", value: "FREE_SHIPPING" },
                                    { label: "No Luck / Try Again", value: "TRY_AGAIN" },
                                  ]}
                                  value={seg.discountType}
                                  onChange={(val) => handleSegmentChange(idx, "discountType", val)}
                                />
                              </Grid.Cell>

                              <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4, xl: 4 }}>
                                <TextField
                                  label="Discount Value (% or $)"
                                  value={seg.discountValue}
                                  onChange={(val) => handleSegmentChange(idx, "discountValue", val)}
                                  disabled={seg.discountType === "FREE_SHIPPING" || seg.discountType === "TRY_AGAIN"}
                                  autoComplete="off"
                                />
                              </Grid.Cell>

                              <Grid.Cell columnSpan={{ xs: 12, sm: 12, md: 12, lg: 12, xl: 12 }}>
                                <TextField
                                  label="Custom Coupon Code / Code Prefix (Optional)"
                                  value={seg.customCode || ""}
                                  onChange={(val) => handleSegmentChange(idx, "customCode", val)}
                                  placeholder="e.g. SAVE20 or WELCOME10 (Leave blank to generate unique single-use code)"
                                  helpText="If a custom coupon code is entered (e.g. SAVE20), winning customers will receive that exact code. If left blank, a unique single-use code is automatically generated in Shopify."
                                  autoComplete="off"
                                  disabled={seg.discountType === "TRY_AGAIN"}
                                />
                              </Grid.Cell>

                              <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
                                <TextField
                                  label="Win Probability (%)"
                                  type="number"
                                  value={String(seg.winProbability)}
                                  onChange={(val) => handleSegmentChange(idx, "winProbability", val)}
                                  autoComplete="off"
                                />
                              </Grid.Cell>

                              <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
                                <TextField
                                  label="Color (Hex)"
                                  value={seg.hexColor}
                                  onChange={(val) => handleSegmentChange(idx, "hexColor", val)}
                                  autoComplete="off"
                                />
                              </Grid.Cell>
                            </Grid>
                          </BlockStack>
                        </Card>
                      ))}
                    </BlockStack>
                  )}

                  {selectedTab === 1 && (
                    <BlockStack gap="400">
                      <Text variant="headingMd">Smart Trigger & Targeting Rules</Text>

                      <Card padding="400">
                        <BlockStack gap="300">
                          <Checkbox
                            label="Exit Intent Trigger (Triggers when desktop cursor leaves viewport)"
                            checked={triggers.exitIntent}
                            onChange={(val) => setTriggers({ ...triggers, exitIntent: val })}
                          />

                          <TextField
                            label="Scroll Depth Threshold (%)"
                            type="number"
                            value={String(triggers.scrollDepth)}
                            onChange={(val) => setTriggers({ ...triggers, scrollDepth: parseInt(val) || 0 })}
                            helpText="Triggers popup when visitor scrolls X% of page height."
                            autoComplete="off"
                          />

                          <TextField
                            label="Time Delay (seconds)"
                            type="number"
                            value={String(triggers.timeDelay)}
                            onChange={(val) => setTriggers({ ...triggers, timeDelay: parseInt(val) || 0 })}
                            helpText="Seconds to wait before displaying the wheel popup."
                            autoComplete="off"
                          />

                          <TextField
                            label="Minimum Cart Value ($)"
                            type="number"
                            value={String(triggers.cartValueMin)}
                            onChange={(val) => setTriggers({ ...triggers, cartValueMin: parseFloat(val) || 0 })}
                            helpText="Only show wheel if cart total meets or exceeds this amount."
                            autoComplete="off"
                          />

                          <TextField
                            label="Spin Recurrence Interval (minutes after opt-in)"
                            type="number"
                            value={String(triggers.recurrenceInterval ?? 15)}
                            onChange={(val) => setTriggers({ ...triggers, recurrenceInterval: parseInt(val) || 0 })}
                            helpText="Once a customer submits an email, hide the popup for this many minutes (Default: 15 mins). If 0, the popup will show on every reload."
                            autoComplete="off"
                          />
                        </BlockStack>
                      </Card>
                    </BlockStack>
                  )}

                  {selectedTab === 2 && (
                    <BlockStack gap="400">
                      <Text variant="headingMd">Appearance & Content Settings</Text>

                      <Select
                        label="Display Mode"
                        options={[
                          { label: "Center Overlay Modal Pop-Up", value: "POPUP" },
                          { label: "Embedded Inline Wheel (App Block)", value: "EMBED" },
                          { label: "Slide-In Side Drawer (Half-Screen Left-to-Right)", value: "SLIDE_IN" },
                        ]}
                        value={type}
                        onChange={setType}
                      />

                      <TextField
                        label="Campaign Title"
                        value={theme.title}
                        onChange={(val) => setTheme({ ...theme, title: val })}
                        autoComplete="off"
                      />

                      <TextField
                        label="Subtitle / Description"
                        value={theme.subtitle}
                        onChange={(val) => setTheme({ ...theme, subtitle: val })}
                        autoComplete="off"
                      />

                      <TextField
                        label="Spin Button Text"
                        value={theme.buttonText}
                        onChange={(val) => setTheme({ ...theme, buttonText: val })}
                        autoComplete="off"
                      />

                      <TextField
                        label="Floating Launcher Button Text"
                        value={theme.floatingLauncherText}
                        onChange={(val) => setTheme({ ...theme, floatingLauncherText: val })}
                        autoComplete="off"
                      />

                      <TextField
                        label="Custom Launcher Icon SVG Code (Optional)"
                        value={theme.launcherSvg || ""}
                        onChange={(val) => setTheme({ ...theme, launcherSvg: val })}
                        placeholder='<svg viewBox="0 0 24 24" width="20" height="20">...</svg>'
                        helpText="Paste your own custom SVG code here to display your custom icon on the floating launcher button."
                        multiline={3}
                        autoComplete="off"
                      />

                      <TextField
                        label="Primary Color (Hex)"
                        value={theme.primaryColor}
                        onChange={(val) => setTheme({ ...theme, primaryColor: val })}
                        autoComplete="off"
                      />

                      <Checkbox
                        label="Require Phone Number (SMS Lead Collection)"
                        checked={theme.requirePhone}
                        onChange={(val) => setTheme({ ...theme, requirePhone: val })}
                      />
                    </BlockStack>
                  )}
                </Box>
              </Tabs>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
