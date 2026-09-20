import { useState, useMemo } from "react";
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

  // Fetch all captured leads across all shops
  const allLeads = await prisma.lead.findMany({
    include: {
      shop: {
        select: { shopifyDomain: true, currentPlan: true },
      },
      campaign: {
        select: { name: true },
      },
    },
    orderBy: { convertedAt: "desc" },
  });

  const totalStores = allShops.length;

  let freeStores = 0;
  let starterStores = 0;
  let basicStores = 0;
  let growthStores = 0;
  let proStores = 0;
  let totalImpressionsMonth = 0;
  let totalLeadsCaptured = allLeads.length;

  allShops.forEach((shop) => {
    totalImpressionsMonth += shop.monthlyImpressionsCount || 0;

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
      allLeads,
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
    allLeads = [],
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

  const [activeTab, setActiveTab] = useState("stores"); // "stores" | "leads"
  const [selectedDomain, setSelectedDomain] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [pageSize, setPageSize] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);
  const [copiedId, setCopiedId] = useState(null);

  // Compute unique shop domains with lead counts for filter dropdown
  const domainOptions = useMemo(() => {
    const counts = {};
    allLeads.forEach((l) => {
      const d = l.shop?.shopifyDomain || "Unknown";
      counts[d] = (counts[d] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [allLeads]);

  // Filtered leads calculation
  const filteredLeads = useMemo(() => {
    return allLeads.filter((lead) => {
      const shopDomain = (lead.shop?.shopifyDomain || "").toLowerCase();
      const email = (lead.email || "").toLowerCase();
      const phone = (lead.phone || "").toLowerCase();
      const wonCode = (lead.wonCode || "").toLowerCase();
      const wonLabel = (lead.wonDiscountLabel || "").toLowerCase();
      const campaign = (lead.campaign?.name || "").toLowerCase();

      // Domain filter
      if (selectedDomain !== "ALL" && shopDomain !== selectedDomain.toLowerCase()) {
        return false;
      }

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matches =
          email.includes(q) ||
          phone.includes(q) ||
          wonCode.includes(q) ||
          wonLabel.includes(q) ||
          shopDomain.includes(q) ||
          campaign.includes(q);
        if (!matches) return false;
      }

      return true;
    });
  }, [allLeads, selectedDomain, searchQuery]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredLeads.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const paginatedLeads = filteredLeads.slice(startIndex, startIndex + pageSize);

  // Switch to leads tab filtered by a specific domain
  const handleViewDomainLeads = (domain) => {
    setSelectedDomain(domain);
    setActiveTab("leads");
    setCurrentPage(1);
    setSearchQuery("");
  };

  // CSV Export function
  const handleExportCSV = () => {
    if (filteredLeads.length === 0) {
      alert("No leads found to export.");
      return;
    }

    const headers = [
      "Store Domain",
      "Email",
      "Phone",
      "Campaign Name",
      "Prize Won",
      "Coupon Code",
      "Device",
      "Date Collected",
    ];

    const csvRows = [headers.map((h) => `"${h}"`).join(",")];

    filteredLeads.forEach((lead) => {
      const row = [
        lead.shop?.shopifyDomain || "",
        lead.email || "",
        lead.phone || "",
        lead.campaign?.name || "Welcome Campaign",
        lead.wonDiscountLabel || "",
        lead.wonCode || "",
        lead.deviceType || "desktop",
        lead.convertedAt ? new Date(lead.convertedAt).toLocaleString() : "",
      ];
      csvRows.push(row.map((val) => `"${String(val).replace(/"/g, '""')}"`).join(","));
    });

    const csvContent = csvRows.join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const domainTag = selectedDomain === "ALL" ? "all-domains" : selectedDomain.replace(/[^a-z0-9]/gi, "_");
    link.setAttribute("href", url);
    link.setAttribute("download", `convert-spin-leads-${domainTag}-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyEmail = (email, id) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(email);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    }
  };

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
      <div style={{ maxWidth: "1280px", margin: "0 auto" }}>
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
              Live Platform Revenue, Active Merchant Stores & Global Collected Emails Directory
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
                transition: "background 0.2s",
              }}
              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#475569")}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "#334155")}
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
            <div style={{ fontSize: "12px", color: "#64748B" }}>Emails & Phone Opt-ins across all stores</div>
          </div>
        </div>

        {/* Tab Navigation Switcher */}
        <div style={{ display: "flex", gap: "12px", marginBottom: "20px" }}>
          <button
            onClick={() => setActiveTab("stores")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              backgroundColor: activeTab === "stores" ? "#3B82F6" : "#1E293B",
              color: "#FFFFFF",
              border: activeTab === "stores" ? "1px solid #60A5FA" : "1px solid #334155",
              padding: "10px 20px",
              borderRadius: "10px",
              fontSize: "14px",
              fontWeight: "700",
              cursor: "pointer",
              transition: "all 0.2s",
              boxShadow: activeTab === "stores" ? "0 4px 12px rgba(59, 130, 246, 0.3)" : "none",
            }}
          >
            🏬 Installed Stores Directory ({totalStores})
          </button>

          <button
            onClick={() => setActiveTab("leads")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              backgroundColor: activeTab === "leads" ? "#3B82F6" : "#1E293B",
              color: "#FFFFFF",
              border: activeTab === "leads" ? "1px solid #60A5FA" : "1px solid #334155",
              padding: "10px 20px",
              borderRadius: "10px",
              fontSize: "14px",
              fontWeight: "700",
              cursor: "pointer",
              transition: "all 0.2s",
              boxShadow: activeTab === "leads" ? "0 4px 12px rgba(59, 130, 246, 0.3)" : "none",
            }}
          >
            📧 All Collected Emails & Leads ({totalLeadsCaptured})
            {selectedDomain !== "ALL" && (
              <span
                style={{
                  backgroundColor: "rgba(255,255,255,0.2)",
                  padding: "2px 6px",
                  borderRadius: "4px",
                  fontSize: "11px",
                }}
              >
                Filtered: {selectedDomain}
              </span>
            )}
          </button>
        </div>

        {/* TAB 1: Installed Stores Directory */}
        {activeTab === "stores" && (
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
              <div>
                <h2 style={{ fontSize: "18px", fontWeight: "700", margin: "0 0 4px 0", color: "#FFFFFF" }}>
                  Merchant Stores Directory ({totalStores})
                </h2>
                <span style={{ fontSize: "12px", color: "#94A3B8" }}>
                  Active pricing tiers: Free (1k), Starter (5k), Basic (20k), Growth (50k), Pro (150k)
                </span>
              </div>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #334155", color: "#94A3B8", fontSize: "12px", textTransform: "uppercase" }}>
                    <th style={{ padding: "12px 16px" }}>Shop Domain</th>
                    <th style={{ padding: "12px 16px" }}>Subscribed / Dynamic Plan</th>
                    <th style={{ padding: "12px 16px" }}>Monthly Impressions</th>
                    <th style={{ padding: "12px 16px" }}>Leads Captured</th>
                    <th style={{ padding: "12px 16px" }}>Install Date</th>
                    <th style={{ padding: "12px 16px", textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {allShops.length === 0 ? (
                    <tr>
                      <td colSpan="6" style={{ padding: "32px", textAlign: "center", color: "#64748B" }}>
                        No merchant stores installed yet.
                      </td>
                    </tr>
                  ) : (
                    allShops.map((shop) => {
                      const count = shop.monthlyImpressionsCount || 0;
                      const planKey = (shop.currentPlan || "FREE").toUpperCase();
                      const tier = PLAN_TIERS[planKey] || PLAN_TIERS.FREE;
                      const dynamic = getDynamicTierInfo(count, planKey);
                      const leadsCount = shop._count?.leads || 0;

                      let planColor = tier.badgeColor || "#38BDF8";
                      let planBg = tier.badgeBg || "rgba(56, 189, 248, 0.15)";
                      let planLabel = tier.name;

                      return (
                        <tr
                          key={shop.id}
                          style={{
                            borderBottom: "1px solid #334155",
                            fontSize: "14px",
                            transition: "background-color 0.15s",
                          }}
                          onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#243248")}
                          onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                        >
                          <td style={{ padding: "14px 16px", fontWeight: "600", color: "#F8FAFC" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <span>🏪</span>
                              <span>{shop.shopifyDomain}</span>
                            </div>
                          </td>
                          <td style={{ padding: "14px 16px" }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                <span
                                  style={{
                                    backgroundColor: planBg,
                                    color: planColor,
                                    border: `1px solid ${planColor}`,
                                    padding: "3px 8px",
                                    borderRadius: "6px",
                                    fontSize: "11px",
                                    fontWeight: "700",
                                  }}
                                >
                                  {planLabel} (${tier.price.toFixed(2)}/mo)
                                </span>

                                {dynamic.isSubscribedCapExceeded && (
                                  <span
                                    style={{
                                      backgroundColor: "rgba(239, 68, 68, 0.15)",
                                      color: "#F87171",
                                      border: "1px solid rgba(239, 68, 68, 0.4)",
                                      padding: "2px 6px",
                                      borderRadius: "4px",
                                      fontSize: "10px",
                                      fontWeight: "700",
                                    }}
                                    title="Exceeded monthly cap — Pop-up automatically paused on storefront"
                                  >
                                    ⏸️ Paused ({count.toLocaleString()} / {dynamic.subscribedLimit.toLocaleString()})
                                  </span>
                                )}
                              </div>

                              {dynamic.isSubscribedCapExceeded && (
                                <span style={{ fontSize: "11px", color: "#94A3B8" }}>
                                  Next tier: {dynamic.dynamicTierName} ({dynamic.targetLimit.toLocaleString()} cap)
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
                                  width: `${Math.min(100, dynamic.progressPercent)}%`,
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
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <span style={{ fontSize: "15px", fontWeight: "700", color: leadsCount > 0 ? "#10B981" : "#94A3B8" }}>
                                {leadsCount.toLocaleString()}
                              </span>
                              {leadsCount > 0 && (
                                <button
                                  onClick={() => handleViewDomainLeads(shop.shopifyDomain)}
                                  style={{
                                    backgroundColor: "rgba(59, 130, 246, 0.15)",
                                    color: "#60A5FA",
                                    border: "1px solid rgba(59, 130, 246, 0.3)",
                                    padding: "3px 8px",
                                    borderRadius: "6px",
                                    fontSize: "11px",
                                    fontWeight: "600",
                                    cursor: "pointer",
                                  }}
                                >
                                  View Emails ↗
                                </button>
                              )}
                            </div>
                          </td>
                          <td style={{ padding: "14px 16px", color: "#64748B", fontSize: "13px" }}>
                            {shop.createdAt ? new Date(shop.createdAt).toLocaleDateString() : "-"}
                          </td>
                          <td style={{ padding: "14px 16px", textAlign: "right" }}>
                            <button
                              onClick={() => handleViewDomainLeads(shop.shopifyDomain)}
                              style={{
                                backgroundColor: "#334155",
                                color: "#F8FAFC",
                                border: "1px solid #475569",
                                padding: "6px 12px",
                                borderRadius: "6px",
                                fontSize: "12px",
                                fontWeight: "600",
                                cursor: "pointer",
                              }}
                            >
                              Inspect Leads 📧
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: All Collected Leads & Emails Directory */}
        {activeTab === "leads" && (
          <div
            style={{
              backgroundColor: "#1E293B",
              border: "1px solid #334155",
              borderRadius: "16px",
              padding: "24px",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.3)",
            }}
          >
            {/* Header & Filter Controls Bar */}
            <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
                <div>
                  <h2 style={{ fontSize: "18px", fontWeight: "700", margin: "0 0 4px 0", color: "#FFFFFF" }}>
                    Global Collected Emails & Leads Directory
                  </h2>
                  <p style={{ fontSize: "13px", color: "#94A3B8", margin: 0 }}>
                    Displaying <strong>{filteredLeads.length.toLocaleString()}</strong> captured leads{" "}
                    {selectedDomain !== "ALL" ? `from store ${selectedDomain}` : "across all registered merchant stores"}
                  </p>
                </div>

                {/* Export CSV Button */}
                <button
                  onClick={handleExportCSV}
                  disabled={filteredLeads.length === 0}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    backgroundColor: filteredLeads.length === 0 ? "#334155" : "#10B981",
                    color: "#FFFFFF",
                    border: "none",
                    padding: "10px 20px",
                    borderRadius: "8px",
                    fontSize: "13px",
                    fontWeight: "700",
                    cursor: filteredLeads.length === 0 ? "not-allowed" : "pointer",
                    boxShadow: filteredLeads.length === 0 ? "none" : "0 4px 12px rgba(16, 185, 129, 0.3)",
                    transition: "all 0.2s",
                  }}
                  onMouseOver={(e) => {
                    if (filteredLeads.length > 0) e.currentTarget.style.backgroundColor = "#059669";
                  }}
                  onMouseOut={(e) => {
                    if (filteredLeads.length > 0) e.currentTarget.style.backgroundColor = "#10B981";
                  }}
                >
                  <span>📥 Export to CSV</span>
                  <span
                    style={{
                      backgroundColor: "rgba(0,0,0,0.2)",
                      padding: "2px 6px",
                      borderRadius: "4px",
                      fontSize: "11px",
                    }}
                  >
                    {filteredLeads.length} leads
                  </span>
                </button>
              </div>

              {/* Filters & Search Row */}
              <div
                style={{
                  display: "flex",
                  gap: "12px",
                  flexWrap: "wrap",
                  alignItems: "center",
                  backgroundColor: "#0F172A",
                  padding: "16px",
                  borderRadius: "12px",
                  border: "1px solid #334155",
                }}
              >
                {/* Domain Selector */}
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "11px", color: "#94A3B8", fontWeight: "600", textTransform: "uppercase" }}>
                    Filter by Store Domain:
                  </label>
                  <select
                    value={selectedDomain}
                    onChange={(e) => {
                      setSelectedDomain(e.target.value);
                      setCurrentPage(1);
                    }}
                    style={{
                      backgroundColor: "#1E293B",
                      color: "#F8FAFC",
                      border: "1px solid #475569",
                      padding: "8px 12px",
                      borderRadius: "8px",
                      fontSize: "13px",
                      outline: "none",
                      cursor: "pointer",
                      minWidth: "220px",
                    }}
                  >
                    <option value="ALL">All Registered Stores ({allLeads.length} total leads)</option>
                    {domainOptions.map(([domain, count]) => (
                      <option key={domain} value={domain}>
                        {domain} ({count} leads)
                      </option>
                    ))}
                  </select>
                </div>

                {/* Search Bar */}
                <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: 1, minWidth: "220px" }}>
                  <label style={{ fontSize: "11px", color: "#94A3B8", fontWeight: "600", textTransform: "uppercase" }}>
                    Search Email / Phone / Coupon:
                  </label>
                  <div style={{ position: "relative" }}>
                    <input
                      type="text"
                      placeholder="Search email, coupon code, domain..."
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setCurrentPage(1);
                      }}
                      style={{
                        width: "100%",
                        backgroundColor: "#1E293B",
                        color: "#F8FAFC",
                        border: "1px solid #475569",
                        padding: "8px 12px",
                        paddingRight: searchQuery ? "32px" : "12px",
                        borderRadius: "8px",
                        fontSize: "13px",
                        outline: "none",
                        boxSizing: "border-box",
                      }}
                    />
                    {searchQuery && (
                      <button
                        onClick={() => {
                          setSearchQuery("");
                          setCurrentPage(1);
                        }}
                        style={{
                          position: "absolute",
                          right: "8px",
                          top: "50%",
                          transform: "translateY(-50%)",
                          background: "none",
                          border: "none",
                          color: "#94A3B8",
                          cursor: "pointer",
                          fontSize: "14px",
                        }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                {/* Page Size Selector */}
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "11px", color: "#94A3B8", fontWeight: "600", textTransform: "uppercase" }}>
                    Rows per page:
                  </label>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    style={{
                      backgroundColor: "#1E293B",
                      color: "#F8FAFC",
                      border: "1px solid #475569",
                      padding: "8px 12px",
                      borderRadius: "8px",
                      fontSize: "13px",
                      outline: "none",
                      cursor: "pointer",
                    }}
                  >
                    <option value={10}>10 rows</option>
                    <option value={25}>25 rows</option>
                    <option value={50}>50 rows</option>
                    <option value={100}>100 rows</option>
                    <option value={500}>All (up to 500)</option>
                  </select>
                </div>

                {/* Reset Filters */}
                {(selectedDomain !== "ALL" || searchQuery) && (
                  <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                    <button
                      onClick={() => {
                        setSelectedDomain("ALL");
                        setSearchQuery("");
                        setCurrentPage(1);
                      }}
                      style={{
                        backgroundColor: "#334155",
                        color: "#CBD5E1",
                        border: "1px solid #475569",
                        padding: "8px 14px",
                        borderRadius: "8px",
                        fontSize: "12px",
                        fontWeight: "600",
                        cursor: "pointer",
                        marginTop: "19px",
                      }}
                    >
                      Clear Filters ↺
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Leads Table */}
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #334155", color: "#94A3B8", fontSize: "12px", textTransform: "uppercase" }}>
                    <th style={{ padding: "12px 16px" }}>Store Domain</th>
                    <th style={{ padding: "12px 16px" }}>Customer Email</th>
                    <th style={{ padding: "12px 16px" }}>Phone</th>
                    <th style={{ padding: "12px 16px" }}>Prize / Coupon Won</th>
                    <th style={{ padding: "12px 16px" }}>Campaign</th>
                    <th style={{ padding: "12px 16px" }}>Device</th>
                    <th style={{ padding: "12px 16px" }}>Captured Date</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedLeads.length === 0 ? (
                    <tr>
                      <td colSpan="7" style={{ padding: "40px", textAlign: "center", color: "#64748B" }}>
                        <div style={{ fontSize: "28px", marginBottom: "8px" }}>📭</div>
                        <div style={{ fontSize: "15px", fontWeight: "600", color: "#94A3B8" }}>No leads match the current filters</div>
                        <div style={{ fontSize: "12px", color: "#64748B", marginTop: "4px" }}>
                          Try clearing your search query or selecting "All Registered Stores".
                        </div>
                      </td>
                    </tr>
                  ) : (
                    paginatedLeads.map((lead) => {
                      const domain = lead.shop?.shopifyDomain || "Unknown Store";
                      const isCopied = copiedId === lead.id;

                      return (
                        <tr
                          key={lead.id}
                          style={{
                            borderBottom: "1px solid #334155",
                            fontSize: "13px",
                            transition: "background-color 0.15s",
                          }}
                          onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#243248")}
                          onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                        >
                          {/* Store Domain */}
                          <td style={{ padding: "12px 16px" }}>
                            <button
                              onClick={() => {
                                setSelectedDomain(domain);
                                setCurrentPage(1);
                              }}
                              style={{
                                background: "none",
                                border: "none",
                                color: "#60A5FA",
                                fontSize: "13px",
                                fontWeight: "600",
                                cursor: "pointer",
                                padding: 0,
                                textAlign: "left",
                                textDecoration: "underline",
                              }}
                              title={`Filter table by ${domain}`}
                            >
                              {domain}
                            </button>
                          </td>

                          {/* Email */}
                          <td style={{ padding: "12px 16px" }}>
                            {lead.email ? (
                              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                <span style={{ color: "#F8FAFC", fontWeight: "600" }}>{lead.email}</span>
                                <button
                                  onClick={() => handleCopyEmail(lead.email, lead.id)}
                                  style={{
                                    backgroundColor: isCopied ? "rgba(16, 185, 129, 0.2)" : "rgba(255,255,255,0.08)",
                                    color: isCopied ? "#34D399" : "#94A3B8",
                                    border: isCopied ? "1px solid #34D399" : "1px solid transparent",
                                    padding: "2px 6px",
                                    borderRadius: "4px",
                                    fontSize: "10px",
                                    cursor: "pointer",
                                  }}
                                  title="Copy email to clipboard"
                                >
                                  {isCopied ? "✓ Copied" : "Copy"}
                                </button>
                              </div>
                            ) : (
                              <span style={{ color: "#64748B" }}>-</span>
                            )}
                          </td>

                          {/* Phone */}
                          <td style={{ padding: "12px 16px", color: lead.phone ? "#F8FAFC" : "#64748B" }}>
                            {lead.phone || "-"}
                          </td>

                          {/* Won Coupon & Prize */}
                          <td style={{ padding: "12px 16px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                              {lead.wonDiscountLabel && (
                                <span
                                  style={{
                                    backgroundColor: "rgba(16, 185, 129, 0.15)",
                                    color: "#34D399",
                                    border: "1px solid rgba(16, 185, 129, 0.3)",
                                    padding: "2px 6px",
                                    borderRadius: "4px",
                                    fontSize: "11px",
                                    fontWeight: "700",
                                  }}
                                >
                                  {lead.wonDiscountLabel}
                                </span>
                              )}
                              {lead.wonCode && (
                                <span
                                  style={{
                                    backgroundColor: "#0F172A",
                                    color: "#FBBF24",
                                    border: "1px solid #475569",
                                    padding: "2px 6px",
                                    borderRadius: "4px",
                                    fontSize: "11px",
                                    fontFamily: "monospace",
                                    fontWeight: "600",
                                  }}
                                >
                                  {lead.wonCode}
                                </span>
                              )}
                              {!lead.wonDiscountLabel && !lead.wonCode && (
                                <span style={{ color: "#64748B" }}>-</span>
                              )}
                            </div>
                          </td>

                          {/* Campaign */}
                          <td style={{ padding: "12px 16px", color: "#94A3B8" }}>
                            {lead.campaign?.name || "Welcome Campaign"}
                          </td>

                          {/* Device */}
                          <td style={{ padding: "12px 16px" }}>
                            <span
                              style={{
                                backgroundColor: "rgba(255,255,255,0.06)",
                                color: "#CBD5E1",
                                padding: "2px 6px",
                                borderRadius: "4px",
                                fontSize: "11px",
                                textTransform: "capitalize",
                              }}
                            >
                              {lead.deviceType === "mobile" ? "📱 Mobile" : "💻 Desktop"}
                            </span>
                          </td>

                          {/* Captured Date */}
                          <td style={{ padding: "12px 16px", color: "#94A3B8", fontSize: "12px" }}>
                            {lead.convertedAt ? new Date(lead.convertedAt).toLocaleString() : "-"}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls Footer */}
            {filteredLeads.length > 0 && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginTop: "20px",
                  paddingTop: "16px",
                  borderTop: "1px solid #334155",
                  flexWrap: "wrap",
                  gap: "12px",
                }}
              >
                <div style={{ fontSize: "13px", color: "#94A3B8" }}>
                  Showing <strong>{startIndex + 1}</strong> to{" "}
                  <strong>{Math.min(startIndex + pageSize, filteredLeads.length)}</strong> of{" "}
                  <strong>{filteredLeads.length.toLocaleString()}</strong> records
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={safePage === 1}
                    style={{
                      backgroundColor: safePage === 1 ? "#1E293B" : "#334155",
                      color: safePage === 1 ? "#475569" : "#F8FAFC",
                      border: "1px solid #475569",
                      padding: "6px 12px",
                      borderRadius: "6px",
                      fontSize: "12px",
                      fontWeight: "600",
                      cursor: safePage === 1 ? "not-allowed" : "pointer",
                    }}
                  >
                    « Previous
                  </button>

                  <span style={{ fontSize: "13px", color: "#CBD5E1", padding: "0 8px" }}>
                    Page <strong>{safePage}</strong> of <strong>{totalPages}</strong>
                  </span>

                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safePage === totalPages}
                    style={{
                      backgroundColor: safePage === totalPages ? "#1E293B" : "#334155",
                      color: safePage === totalPages ? "#475569" : "#F8FAFC",
                      border: "1px solid #475569",
                      padding: "6px 12px",
                      borderRadius: "6px",
                      fontSize: "12px",
                      fontWeight: "600",
                      cursor: safePage === totalPages ? "not-allowed" : "pointer",
                    }}
                  >
                    Next »
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
