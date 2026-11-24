import { PLAN_TIERS, AUTO_SCALE_PLAN } from "../services/plans";

// Public pricing page linked from the Shopify App Store listing.
// Prices and limits come from plans.js so this page always matches what the app bills.

export const meta = () => [
  { title: "Pricing | ConvertSpin Spin Wheel Popup" },
  {
    name: "description",
    content:
      "ConvertSpin pricing: free up to 1,000 impressions per 30 days, fixed monthly plans from $2.99, or pay-as-you-grow Auto-Scale capped at $19.99.",
  },
];

const fmtPrice = (price) => (price === 0 ? "Free" : `$${price.toFixed(2)}`);
const fmtNum = (n) => n.toLocaleString("en-US");

const TIER_KEYS = ["FREE", "STARTER", "BASIC", "GROWTH", "PRO"];

const css = `
  .pr { --bg:#F8FAFC; --card:#FFFFFF; --ink:#0F172A; --muted:#475569; --line:#E2E8F0; --accent:#4F46E5; --ok:#047857; --okbg:#ECFDF5;
        background:var(--bg); color:var(--ink); min-height:100vh; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  @media (prefers-color-scheme: dark) {
    .pr { --bg:#0B1120; --card:#111827; --ink:#F1F5F9; --muted:#94A3B8; --line:#1F2937; --accent:#818CF8; --ok:#34D399; --okbg:#052E24; }
  }
  .pr-wrap { max-width: 1040px; margin: 0 auto; padding: 48px 16px 64px; }
  .pr h1 { font-size: 32px; line-height: 1.2; margin: 0 0 8px; letter-spacing: -0.01em; }
  .pr h2 { font-size: 22px; margin: 48px 0 6px; }
  .pr p { color: var(--muted); line-height: 1.6; margin: 0 0 12px; }
  .pr-lead { font-size: 17px; max-width: 720px; }
  .pr-table { width: 100%; border-collapse: collapse; background: var(--card); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; margin-top: 16px; }
  .pr-table th, .pr-table td { text-align: left; padding: 14px 16px; border-bottom: 1px solid var(--line); font-size: 15px; }
  .pr-table th { font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); font-weight: 600; }
  .pr-table tr:last-child td { border-bottom: none; }
  .pr-num { font-variant-numeric: tabular-nums; white-space: nowrap; }
  .pr-auto { background: var(--card); border: 2px solid var(--accent); border-radius: 14px; padding: 24px; margin-top: 16px; }
  .pr-badge { display: inline-block; font-size: 12px; font-weight: 700; color: var(--ok); background: var(--okbg); padding: 3px 10px; border-radius: 999px; margin-left: 8px; vertical-align: middle; }
  .pr-list { margin: 12px 0 0; padding-left: 20px; color: var(--muted); line-height: 1.8; }
  .pr-list strong { color: var(--ink); }
  .pr-foot { margin-top: 48px; padding-top: 20px; border-top: 1px solid var(--line); font-size: 13px; }
  .pr-scroll { overflow-x: auto; }
  @media (max-width: 640px) { .pr h1 { font-size: 26px; } .pr-table th, .pr-table td { padding: 12px 10px; font-size: 14px; } }
`;

export default function Pricing() {
  const tiers = TIER_KEYS.map((key) => PLAN_TIERS[key]);

  return (
    <div className="pr">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <main className="pr-wrap">
        <h1>ConvertSpin pricing</h1>
        <p className="pr-lead">
          Every plan includes every ConvertSpin feature. Plans differ only in how many spin wheel
          impressions your store can show per 30-day billing cycle. All charges are billed in USD through
          your Shopify invoice, and you can change or cancel your plan anytime from inside the app.
        </p>

        <h2>Fixed monthly plans</h2>
        <p>Pay a flat price every 30 days for a set number of impressions.</p>
        <div className="pr-scroll">
          <table className="pr-table">
            <thead>
              <tr>
                <th>Plan</th>
                <th>Price per 30 days</th>
                <th>Impressions per 30 days</th>
              </tr>
            </thead>
            <tbody>
              {tiers.map((t) => (
                <tr key={t.key}>
                  <td><strong>{t.name}</strong></td>
                  <td className="pr-num">{fmtPrice(t.price)}</td>
                  <td className="pr-num">Up to {fmtNum(t.monthlyImpressions)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2>
          {AUTO_SCALE_PLAN.name}
          <span className="pr-badge">Pay as you grow</span>
        </h2>
        <div className="pr-auto">
          <p style={{ color: "inherit", fontSize: 16 }}>
            <strong>$0 to start, never more than ${AUTO_SCALE_PLAN.cappedAmount.toFixed(2)} per 30 days.</strong>
          </p>
          <p>
            You approve a usage-based subscription once. Each 30-day cycle you are billed only for the tier
            your impressions actually reach, so your wheel keeps running as traffic grows instead of pausing.
            Usage resets at the start of every cycle, so quieter months cost less.
          </p>
          <div className="pr-scroll">
            <table className="pr-table">
              <thead>
                <tr>
                  <th>Impressions this cycle</th>
                  <th>Total charge for the cycle</th>
                </tr>
              </thead>
              <tbody>
                {tiers.map((t, i) => {
                  const from = i === 0 ? 0 : tiers[i - 1].monthlyImpressions + 1;
                  return (
                    <tr key={t.key}>
                      <td className="pr-num">
                        {i === 0 ? `Up to ${fmtNum(t.monthlyImpressions)}` : `${fmtNum(from)} to ${fmtNum(t.monthlyImpressions)}`}
                      </td>
                      <td className="pr-num">{fmtPrice(t.price)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <ul className="pr-list">
            <li>Charges appear as usage charges on your Shopify invoice when your store moves into a higher tier during a cycle.</li>
            <li>You receive an email each time your store moves into a higher tier.</li>
            <li>Shopify lets you lower the spending limit after approval. Usage above your limit is not charged.</li>
          </ul>
        </div>

        <h2>Good to know</h2>
        <ul className="pr-list">
          <li><strong>Impression:</strong> one display of the spin wheel popup to a visitor on your storefront.</li>
          <li><strong>Free trial:</strong> there is no time-limited trial. The Free plan is free forever for up to {fmtNum(PLAN_TIERS.FREE.monthlyImpressions)} impressions per 30 days.</li>
          <li><strong>Reaching your limit:</strong> on the Free plan and fixed plans, the wheel pauses until your next 30-day cycle. You are never charged automatically unless you have approved the {AUTO_SCALE_PLAN.name}.</li>
          <li><strong>Above {fmtNum(AUTO_SCALE_PLAN.monthlyImpressions)} impressions:</strong> the wheel pauses until your next cycle on every plan, including {AUTO_SCALE_PLAN.name}.</li>
          <li><strong>Changing plans:</strong> upgrade, downgrade or cancel anytime from <em>Plans &amp; Billing</em> in the app. No need to contact support or reinstall.</li>
          <li><strong>Taxes:</strong> prices exclude any taxes Shopify applies in your region.</li>
        </ul>

        <p className="pr-foot">
          ConvertSpin Spin Wheel Popup by Sirpi Softwares. Billing is processed by Shopify.
        </p>
      </main>
    </div>
  );
}
