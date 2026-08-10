import { redirect, useLoaderData, Form } from "react-router";
import prisma from "../db.server";
import { PLAN_TIERS } from "../services/plans";

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

  const mrr = (basicStores * 9.99 + advancedStores * 29.99).toFixed(2);
  const arr = (parseFloat(mrr) * 12).toFixed(2);
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
    basicStores = 0,
    advancedStores = 0,
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
              <span style={{ color: "#34D399" }}>{basicStores + advancedStores} Paid</span>
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
          <h2 style={{ fontSize: "18px", fontWeight: "700", margin: "0 0 20px 0", color: "#FFFFFF" }}>
            Installed Merchant Stores Directory ({totalStores})
          </h2>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "14px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #334155", color: "#94A3B8", fontSize: "12px", textTransform: "uppercase" }}>
                  <th style={{ padding: "12px 16px" }}>Shop Domain</th>
                  <th style={{ padding: "12px 16px" }}>Plan</th>
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
                    const planInfo = PLAN_TIERS[shop.currentPlan] || PLAN_TIERS.FREE;
                    const limit = planInfo.monthlyImpressions || 300;
                    const count = shop.monthlyImpressionsCount || 0;
                    const pct = Math.min(100, Math.round((count / limit) * 100));

                    let badgeColor = "#38BDF8";
                    let badgeBg = "rgba(56, 189, 248, 0.15)";
                    if (shop.currentPlan === "BASIC") {
                      badgeColor = "#34D399";
                      badgeBg = "rgba(52, 211, 153, 0.15)";
                    } else if (shop.currentPlan === "ADVANCED") {
                      badgeColor = "#F59E0B";
                      badgeBg = "rgba(245, 158, 11, 0.15)";
                    }

                    return (
                      <tr key={shop.id} style={{ borderBottom: "1px solid #334155" }}>
                        <td style={{ padding: "14px 16px", fontWeight: "600", color: "#FFFFFF" }}>
                          {shop.shopifyDomain}
                        </td>
                        <td style={{ padding: "14px 16px" }}>
                          <span
                            style={{
                              backgroundColor: badgeBg,
                              color: badgeColor,
                              padding: "4px 10px",
                              borderRadius: "6px",
                              fontSize: "12px",
                              fontWeight: "700",
                            }}
                          >
                            {shop.currentPlan}
                          </span>
                        </td>
                        <td style={{ padding: "14px 16px" }}>
                          <div style={{ fontSize: "13px", color: "#CBD5E1", marginBottom: "4px" }}>
                            {count.toLocaleString()} / {limit.toLocaleString()} ({pct}%)
                          </div>
                          <div
                            style={{
                              width: "100%",
                              maxWidth: "160px",
                              height: "6px",
                              backgroundColor: "#0F172A",
                              borderRadius: "3px",
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                width: `${pct}%`,
                                height: "100%",
                                backgroundColor: pct >= 100 ? "#EF4444" : "#6366F1",
                              }}
                            />
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
