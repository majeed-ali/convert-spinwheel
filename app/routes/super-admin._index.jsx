import { redirect, useLoaderData, Form } from "react-router";
import prisma from "../db.server";
import { PLAN_TIERS, getDynamicTierInfo } from "../services/plans";

export const loader = async ({ request }) => {
  const cookieHeader = request.headers.get("Cookie") || "";
  if (!cookieHeader.includes("dev_admin_session=true")) {
    return redirect("/super-admin/login");
  }

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
  let starterStores = 0;
  let basicStores = 0;
  let growthStores = 0;
  let proStores = 0;
  let totalImpressionsMonth = 0;
  let totalLeadsCaptured = 0;

  allShops.forEach((shop) => {
    totalImpressionsMonth += shop.monthlyImpressionsCount || 0;
    totalLeadsCaptured += shop._count.leads || 0;

    let plan = (shop.currentPlan || "FREE").toUpperCase();
    if (plan === "GROW") plan = "GROWTH";
    if (plan === "ADVANCED") plan = "PRO";

    if (plan === "STARTER") starterStores++;
    else if (plan === "BASIC") basicStores++;
    else if (plan === "GROWTH") growthStores++;
    else if (plan === "PRO") proStores++;
    else freeStores++;
  });

  const mrr = (starterStores * 2.99 + basicStores * 5.99 + growthStores * 9.99 + proStores * 19.99).toFixed(2);
  const arr = (parseFloat(mrr) * 12).toFixed(2);
  const totalAllTimeImpressions = await prisma.impressionLog.count();

  return JSON.parse(
    JSON.stringify({
      allShops,
      totalStores,
      freeStores,
      starterStores,
      basicStores,
      growthStores,
      proStores,
      mrr,
      arr,
      totalImpressionsMonth,
      totalAllTimeImpressions,
      totalLeadsCaptured,
    })
  );
};

export const action = async ({ request }) => {
  return redirect("/super-admin/login", {
    headers: {
      "Set-Cookie": "dev_admin_session=; Path=/; HttpOnly; Max-Age=0",
    },
  });
};

export default function SuperAdminDashboard() {
  const {
    allShops = [],
    totalStores = 0,
    freeStores = 0,
    starterStores = 0,
    basicStores = 0,
    growthStores = 0,
    proStores = 0,
    mrr = "0.00",
    arr = "0.00",
    totalImpressionsMonth = 0,
    totalAllTimeImpressions = 0,
    totalLeadsCaptured = 0,
  } = useLoaderData() || {};

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#0F172A",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        color: "#F8FAFC",
        padding: "32px 24px",
      }}
    >
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        {/* Top Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "32px",
            paddingBottom: "20px",
            borderBottom: "1px solid #334155",
          }}
        >
          <div>
            <h1 style={{ fontSize: "26px", fontWeight: "800", margin: "0 0 6px 0", color: "#FFFFFF" }}>
              👑 Developer Super Admin Portal
            </h1>
            <p style={{ fontSize: "14px", color: "#94A3B8", margin: 0 }}>
              Live Platform Revenue, Active Merchant Stores & System Impressions
            </p>
          </div>

          <Form method="post">
            <button
              type="submit"
              style={{
                backgroundColor: "#334155",
                color: "#F8FAFC",
                border: "1px solid #475569",
                padding: "8px 16px",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: "600",
                cursor: "pointer",
              }}
            >
              Sign Out 🚪
            </button>
          </Form>
        </div>

        {/* Metrics Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "20px",
            marginBottom: "32px",
          }}
        >
          {/* MRR Card */}
          <div
            style={{
              backgroundColor: "#1E293B",
              border: "1px solid #334155",
              borderRadius: "14px",
              padding: "24px",
              boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.3)",
            }}
          >
            <div style={{ fontSize: "13px", color: "#94A3B8", fontWeight: "600", marginBottom: "8px" }}>
              Monthly Recurring Revenue (MRR)
            </div>
            <div style={{ fontSize: "32px", fontWeight: "800", color: "#10B981", marginBottom: "4px" }}>
              ${mrr} <span style={{ fontSize: "14px", color: "#94A3B8", fontWeight: "normal" }}>/ mo</span>
            </div>
            <div style={{ fontSize: "12px", color: "#64748B" }}>Projected ARR: ${arr} / yr</div>
          </div>

          {/* Installed Stores Card */}
          <div
            style={{
              backgroundColor: "#1E293B",
              border: "1px solid #334155",
              borderRadius: "14px",
              padding: "24px",
              boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.3)",
            }}
          >
            <div style={{ fontSize: "13px", color: "#94A3B8", fontWeight: "600", marginBottom: "8px" }}>
              Active Installed Merchant Stores
            </div>
            <div style={{ fontSize: "32px", fontWeight: "800", color: "#6366F1", marginBottom: "4px" }}>
              {totalStores}
            </div>
            <div style={{ fontSize: "12px", color: "#94A3B8" }}>
              <span style={{ color: "#38BDF8" }}>{freeStores} Free</span> •{" "}
              <span style={{ color: "#34D399" }}>{starterStores + basicStores + growthStores + proStores} Paid</span>
            </div>
          </div>

          {/* Monthly Impressions Card */}
          <div
            style={{
              backgroundColor: "#1E293B",
              border: "1px solid #334155",
              borderRadius: "14px",
              padding: "24px",
              boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.3)",
            }}
          >
            <div style={{ fontSize: "13px", color: "#94A3B8", fontWeight: "600", marginBottom: "8px" }}>
              Monthly Platform Impressions
            </div>
            <div style={{ fontSize: "32px", fontWeight: "800", color: "#F59E0B", marginBottom: "4px" }}>
              {totalImpressionsMonth.toLocaleString()}
            </div>
            <div style={{ fontSize: "12px", color: "#64748B" }}>
              All-time displays logged: {totalAllTimeImpressions.toLocaleString()}
            </div>
          </div>

          {/* Total Leads Card */}
          <div
            style={{
              backgroundColor: "#1E293B",
              border: "1px solid #334155",
              borderRadius: "14px",
              padding: "24px",
              boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.3)",
            }}
          >
            <div style={{ fontSize: "13px", color: "#94A3B8", fontWeight: "600", marginBottom: "8px" }}>
              Total Leads Captured
            </div>
            <div style={{ fontSize: "32px", fontWeight: "800", color: "#EC4899", marginBottom: "4px" }}>
              {totalLeadsCaptured.toLocaleString()}
            </div>
            <div style={{ fontSize: "12px", color: "#64748B" }}>Emails & Phone Opt-ins</div>
          </div>
        </div>

        {/* Merchant Directory Table */}
        <div
          style={{
            backgroundColor: "#1E293B",
            border: "1px solid #334155",
            borderRadius: "16px",
            padding: "24px",
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.3)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
            <h2 style={{ fontSize: "18px", fontWeight: "700", margin: 0, color: "#FFFFFF" }}>
              Installed Merchant Stores Directory ({totalStores})
            </h2>
            <span style={{ fontSize: "12px", color: "#94A3B8" }}>
              ⚡ Dynamic Tier Progress (1,000 Free → 5,000 Starter → 20,000 Basic → 50,000 Growth → 150,000 Pro)
            </span>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "14px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #334155", color: "#94A3B8", fontSize: "12px", textTransform: "uppercase" }}>
                  <th style={{ padding: "12px 16px" }}>Shop Domain</th>
                  <th style={{ padding: "12px 16px" }}>Subscribed / Dynamic Plan</th>
                  <th style={{ padding: "12px 16px" }}>Monthly Impressions</th>
                  <th style={{ padding: "12px 16px" }}>Leads Captured</th>
                  <th style={{ padding: "12px 16px" }}>Install Date</th>
                </tr>
              </thead>
              <tbody>
                {allShops.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: "32px", textAlign: "center", color: "#64748B" }}>
                      No merchant installations recorded yet.
                    </td>
                  </tr>
                ) : (
                  allShops.map((shop) => {
                    const count = shop.monthlyImpressionsCount || 0;
                    const dynamic = getDynamicTierInfo(count, shop.currentPlan);

                    let planKey = (shop.currentPlan || "FREE").toUpperCase();
                    if (planKey === "GROW") planKey = "GROWTH";
                    if (planKey === "ADVANCED") planKey = "PRO";

                    const currentPlanTier = PLAN_TIERS[planKey] || PLAN_TIERS.FREE;
                    const badgeColor = currentPlanTier.badgeColor || "#38BDF8";
                    const badgeBg = currentPlanTier.badgeBg || "rgba(56, 189, 248, 0.15)";
                    const planLabel = currentPlanTier.key || "FREE";

                    return (
                      <tr key={shop.id} style={{ borderBottom: "1px solid #334155" }}>
                        <td style={{ padding: "14px 16px", fontWeight: "600", color: "#FFFFFF" }}>
                          {shop.shopifyDomain}
                        </td>
                        <td style={{ padding: "14px 16px" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: "6px", alignItems: "flex-start" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <span
                                style={{
                                  backgroundColor: badgeBg,
                                  color: badgeColor,
                                  padding: "3px 8px",
                                  borderRadius: "6px",
                                  fontSize: "11px",
                                  fontWeight: "700",
                                }}
                              >
                                {planLabel}
                              </span>

                              {dynamic.isSubscribedCapExceeded && (
                                <span
                                  style={{
                                    backgroundColor: "rgba(245, 158, 11, 0.15)",
                                    color: "#FBBF24",
                                    border: "1px solid rgba(245, 158, 11, 0.3)",
                                    padding: "2px 6px",
                                    borderRadius: "4px",
                                    fontSize: "10px",
                                    fontWeight: "700",
                                  }}
                                  title={`Exceeded ${dynamic.subscribedLimit} impressions. Auto-scaled tracking to ${dynamic.dynamicTierName}`}
                                >
                                  → {dynamic.dynamicBadge}
                                </span>
                              )}
                            </div>

                            {dynamic.isSubscribedCapExceeded && (
                              <span style={{ fontSize: "11px", color: "#94A3B8" }}>
                                Scaled to {dynamic.targetLimit.toLocaleString()} cap
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: "14px 16px" }}>
                          <div style={{ fontSize: "13px", color: "#CBD5E1", marginBottom: "6px", display: "flex", alignItems: "center", gap: "6px" }}>
                            <strong>{count.toLocaleString()}</strong> / {dynamic.targetLimit.toLocaleString()}
                            <span
                              style={{
                                color: dynamic.progressPercent >= 100 ? "#EF4444" : dynamic.progressPercent > 80 ? "#F59E0B" : "#A5B4FC",
                                fontWeight: "600",
                                fontSize: "12px",
                              }}
                            >
                              ({dynamic.progressPercent}%)
                            </span>
                          </div>

                          <div
                            style={{
                              width: "100%",
                              maxWidth: "180px",
                              height: "6px",
                              backgroundColor: "#0F172A",
                              borderRadius: "3px",
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                width: `${dynamic.progressPercent}%`,
                                height: "100%",
                                backgroundColor:
                                  dynamic.progressPercent >= 100
                                    ? "#EF4444"
                                    : dynamic.progressPercent > 80
                                    ? "#F59E0B"
                                    : dynamic.dynamicTierKey === "PRO"
                                    ? "#F59E0B"
                                    : dynamic.dynamicTierKey === "GROWTH"
                                    ? "#818CF8"
                                    : dynamic.dynamicTierKey === "BASIC"
                                    ? "#60A5FA"
                                    : dynamic.dynamicTierKey === "STARTER"
                                    ? "#34D399"
                                    : "#38BDF8",
                                transition: "width 0.4s ease",
                              }}
                            />
                          </div>

                          <div style={{ fontSize: "11px", color: "#64748B", marginTop: "4px" }}>
                            {dynamic.dynamicTierName} bracket
                          </div>
                        </td>
                        <td style={{ padding: "14px 16px", color: "#CBD5E1" }}>
                          {shop._count?.leads?.toLocaleString() || "0"}
                        </td>
                        <td style={{ padding: "14px 16px", color: "#64748B", fontSize: "13px" }}>
                          {shop.createdAt ? new Date(shop.createdAt).toLocaleDateString() : "-"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
