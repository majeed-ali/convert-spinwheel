import nodemailer from "nodemailer";

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST || "smtp.zeptomail.com";
  const port = parseInt(process.env.SMTP_PORT || "465", 10);
  const secure = process.env.SMTP_SECURE === "true" || port === 465;
  const user = process.env.SMTP_USER || "emailapikey";
  const pass = process.env.SMTP_PASS || "";

  if (!pass) {
    console.warn("[ConvertSpin Email] SMTP password is not configured in .env");
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
  });

  return transporter;
}

const FROM_ADDRESS = process.env.SMTP_FROM || "ConvertSpin <notifications@sirpisoftwares.com>";

/**
 * Common HTML email wrapper with premium responsive styling
 */
function wrapEmailHtml({ title, preheader, contentHtml }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #0F172A; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #334155; }
    .wrapper { width: 100%; table-layout: fixed; background-color: #0F172A; padding: 40px 0; }
    .main { background-color: #ffffff; margin: 0 auto; width: 100%; max-width: 600px; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.3); }
    .header { background: linear-gradient(135deg, #4338CA 0%, #6366F1 50%, #8B5CF6 100%); padding: 36px 32px; text-align: center; }
    .logo-badge { display: inline-block; background: rgba(255,255,255,0.2); backdrop-filter: blur(8px); padding: 6px 16px; border-radius: 20px; color: #ffffff; font-weight: 700; font-size: 13px; letter-spacing: 0.5px; margin-bottom: 12px; }
    .header h1 { color: #ffffff; margin: 0; font-size: 24px; font-weight: 800; line-height: 1.3; }
    .content { padding: 36px 32px; }
    .stat-box { background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 20px; margin: 24px 0; }
    .stat-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #EDF2F7; font-size: 14px; }
    .stat-row:last-child { border-bottom: none; }
    .stat-label { color: #64748B; font-weight: 500; }
    .stat-value { color: #0F172A; font-weight: 700; }
    .btn-container { text-align: center; margin: 32px 0 16px; }
    .btn { display: inline-block; background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); color: #ffffff !important; text-decoration: none; padding: 14px 32px; font-weight: 700; font-size: 15px; border-radius: 10px; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.4); }
    .footer { background-color: #F8FAFC; border-top: 1px solid #E2E8F0; padding: 24px 32px; text-align: center; font-size: 12px; color: #94A3B8; }
    .footer a { color: #6366F1; text-decoration: none; }
  </style>
</head>
<body>
  <div style="display:none;font-size:1px;color:#333333;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
    ${preheader || title}
  </div>
  <table class="wrapper" role="presentation">
    <tr>
      <td align="center">
        <table class="main" role="presentation">
          <tr>
            <td class="header">
              <div class="logo-badge">🎁 CONVERT SPIN WHEEL</div>
              <h1>${title}</h1>
            </td>
          </tr>
          <tr>
            <td class="content">
              ${contentHtml}
            </td>
          </tr>
          <tr>
            <td class="footer">
              <p style="margin: 0 0 8px;">Sent by <strong>ConvertSpin App</strong> for Shopify store.</p>
              <p style="margin: 0;">Need assistance? Reply directly to this email or visit your Shopify admin.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * 1. Warning Email when store reaches 80% of impressions
 */
export async function sendCapWarningEmail({
  to,
  shopDomain,
  currentImpressions,
  limit,
  leadsCount = 0,
  nextPlanName = "Starter Plan",
  nextPlanPrice = 2.99,
}) {
  if (!to) return null;
  const transport = getTransporter();
  if (!transport) return null;

  const appUrl = `https://${shopDomain}/admin/apps/${process.env.SHOPIFY_API_KEY}/app?upgrade=STARTER`;

  const contentHtml = `
    <p style="font-size: 15px; line-height: 1.6; color: #334155; margin-top: 0;">
      Hello Store Owner,
    </p>
    <p style="font-size: 15px; line-height: 1.6; color: #334155;">
      Your Convert Spin Wheel on <strong>${shopDomain}</strong> is performing well! You have already utilized <strong>80%</strong> of your monthly impression quota.
    </p>

    <div class="stat-box">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 6px 0; color: #64748B; font-size: 14px;">Current Impressions</td>
          <td style="padding: 6px 0; text-align: right; color: #F59E0B; font-weight: 700; font-size: 15px;">${currentImpressions.toLocaleString()} / ${limit.toLocaleString()} (80%)</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #64748B; font-size: 14px;">Customer Leads Captured</td>
          <td style="padding: 6px 0; text-align: right; color: #10B981; font-weight: 700; font-size: 15px;">${leadsCount} New Subscribers</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #64748B; font-size: 14px;">Storefront Status</td>
          <td style="padding: 6px 0; text-align: right; color: #3B82F6; font-weight: 700; font-size: 14px;">🟢 Active & Converting</td>
        </tr>
      </table>
    </div>

    <p style="font-size: 14px; line-height: 1.6; color: #475569;">
      Once the 1,000 impression limit is reached, the pop-up will automatically pause on your storefront so you are never charged unexpected fees.
    </p>
    <p style="font-size: 14px; line-height: 1.6; color: #475569;">
      To keep collecting leads and sales without any pause, upgrade to the <strong>${nextPlanName} ($${nextPlanPrice}/mo for 5,000 views)</strong> with 1 click:
    </p>

    <div class="btn-container">
      <a href="${appUrl}" class="btn">⚡ Upgrade to ${nextPlanName} ($${nextPlanPrice}/mo)</a>
    </div>
  `;

  try {
    return await transport.sendMail({
      from: FROM_ADDRESS,
      to,
      subject: `⚠️ ConvertSpin: You have used 80% of your monthly impressions on ${shopDomain}`,
      html: wrapEmailHtml({
        title: "You're Reaching Your Monthly Limit",
        preheader: `Your spin wheel is at 80% usage with ${leadsCount} leads captured. Upgrade to keep converting.`,
        contentHtml,
      }),
    });
  } catch (error) {
    console.error("[ConvertSpin Email] sendCapWarningEmail error:", error);
    return null;
  }
}

/**
 * 2. Urgent Email when store reaches 100% of impressions (Pop-Up Paused)
 */
export async function sendCapPausedEmail({
  to,
  shopDomain,
  currentImpressions,
  limit,
  leadsCount = 0,
  nextPlanName = "Starter Plan",
  nextPlanPrice = 2.99,
}) {
  if (!to) return null;
  const transport = getTransporter();
  if (!transport) return null;

  const appUrl = `https://${shopDomain}/admin/apps/${process.env.SHOPIFY_API_KEY}/app?upgrade=AUTO`;

  const contentHtml = `
    <p style="font-size: 15px; line-height: 1.6; color: #334155; margin-top: 0;">
      Hello Store Owner,
    </p>
    <div style="background-color: #FEF2F2; border-left: 4px solid #EF4444; padding: 12px 16px; border-radius: 6px; margin: 16px 0;">
      <strong style="color: #991B1B; font-size: 15px;">⚠️ Pop-Up Paused: Monthly Free Limit Reached</strong>
      <p style="color: #B91C1C; margin: 4px 0 0; font-size: 13px;">
        Your store logged ${currentImpressions.toLocaleString()} views. The spin wheel has been safely paused on your storefront to prevent unexpected charges.
      </p>
    </div>

    <div class="stat-box">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 6px 0; color: #64748B; font-size: 14px;">Impressions Logged</td>
          <td style="padding: 6px 0; text-align: right; color: #EF4444; font-weight: 700; font-size: 15px;">${currentImpressions.toLocaleString()} / ${limit.toLocaleString()} (100%)</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #64748B; font-size: 14px;">Customer Leads Captured</td>
          <td style="padding: 6px 0; text-align: right; color: #10B981; font-weight: 700; font-size: 15px;">${leadsCount} Email Subscribers</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #64748B; font-size: 14px;">Current Status</td>
          <td style="padding: 6px 0; text-align: right; color: #EF4444; font-weight: 700; font-size: 14px;">⏸️ Paused</td>
        </tr>
      </table>
    </div>

    <p style="font-size: 14px; line-height: 1.6; color: #475569;">
      Visitors to your store are currently missing the chance to spin and convert into paying customers. Turn on Auto-Scale to unpause your wheel. You only pay for the volume you actually use, starting at $${nextPlanPrice} for the ${nextPlanName}, and never more than $19.99 per 30 days:
    </p>

    <div class="btn-container">
      <a href="${appUrl}" class="btn">🚀 Turn On Auto-Scale &amp; Reactivate</a>
    </div>

    <p style="text-align: center; font-size: 12px; color: #94A3B8; margin-top: 12px;">
      Billed seamlessly via your regular Shopify monthly bill. Cancel anytime in 1 click.
    </p>
  `;

  try {
    return await transport.sendMail({
      from: FROM_ADDRESS,
      to,
      subject: `🚨 Spin Wheel Paused on ${shopDomain}: 1-Click to Reactivate`,
      html: wrapEmailHtml({
        title: "Your Spin Wheel Pop-Up is Paused",
        preheader: `You reached 1,000 views and captured ${leadsCount} leads. Click to reactivate your wheel.`,
        contentHtml,
      }),
    });
  } catch (error) {
    console.error("[ConvertSpin Email] sendCapPausedEmail error:", error);
    return null;
  }
}

/**
 * 3. Notification when 30-day cycle finishes and wheel unpauses with fresh quota
 */
export async function sendMonthlyResetEmail({ to, shopDomain, freeLimit = 1000 }) {
  if (!to) return null;
  const transport = getTransporter();
  if (!transport) return null;

  const appUrl = `https://${shopDomain}/admin/apps/${process.env.SHOPIFY_API_KEY}/app`;

  const contentHtml = `
    <p style="font-size: 15px; line-height: 1.6; color: #334155; margin-top: 0;">
      Hello Store Owner,
    </p>
    <p style="font-size: 15px; line-height: 1.6; color: #334155;">
      Great news! Your 30-day monthly billing cycle on <strong>${shopDomain}</strong> has refreshed.
    </p>

    <div class="stat-box" style="background-color: #F0FDF4; border-color: #BBF7D0;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 6px 0; color: #166534; font-size: 14px;">Fresh Impression Quota</td>
          <td style="padding: 6px 0; text-align: right; color: #16A34A; font-weight: 700; font-size: 15px;">${freeLimit.toLocaleString()} Views Available</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #166534; font-size: 14px;">Storefront Status</td>
          <td style="padding: 6px 0; text-align: right; color: #16A34A; font-weight: 700; font-size: 14px;">🟢 Unpaused & Live</td>
        </tr>
      </table>
    </div>

    <p style="font-size: 14px; line-height: 1.6; color: #475569;">
      Your Convert Spin Wheel is now actively displaying to your visitors again and capturing leads for your store.
    </p>

    <div class="btn-container">
      <a href="${appUrl}" class="btn">📊 View Your Dashboard</a>
    </div>
  `;

  try {
    return await transport.sendMail({
      from: FROM_ADDRESS,
      to,
      subject: `🔄 ConvertSpin: Your monthly impressions have reset on ${shopDomain}`,
      html: wrapEmailHtml({
        title: "New Monthly Cycle Started",
        preheader: `Your wheel has been refreshed with ${freeLimit.toLocaleString()} impressions and is active again!`,
        contentHtml,
      }),
    });
  } catch (error) {
    console.error("[ConvertSpin Email] sendMonthlyResetEmail error:", error);
    return null;
  }
}

/**
 * 4. Confirmation email when a merchant upgrades their plan
 */
export async function sendSubscriptionUpgradedEmail({
  to,
  shopDomain,
  planName,
  planPrice,
  impressionLimit,
}) {
  if (!to) return null;
  const transport = getTransporter();
  if (!transport) return null;

  const appUrl = `https://${shopDomain}/admin/apps/${process.env.SHOPIFY_API_KEY}/app`;

  const contentHtml = `
    <p style="font-size: 15px; line-height: 1.6; color: #334155; margin-top: 0;">
      Hello Store Owner,
    </p>
    <p style="font-size: 15px; line-height: 1.6; color: #334155;">
      Thank you for upgrading! Your subscription to the <strong>${planName}</strong> on <strong>${shopDomain}</strong> is now active.
    </p>

    <div class="stat-box">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 6px 0; color: #64748B; font-size: 14px;">Active Plan</td>
          <td style="padding: 6px 0; text-align: right; color: #4F46E5; font-weight: 700; font-size: 15px;">${planName}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #64748B; font-size: 14px;">Monthly Price</td>
          <td style="padding: 6px 0; text-align: right; color: #0F172A; font-weight: 700; font-size: 15px;">$${Number(planPrice).toFixed(2)}/30 days</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #64748B; font-size: 14px;">Monthly Capacity</td>
          <td style="padding: 6px 0; text-align: right; color: #10B981; font-weight: 700; font-size: 15px;">${Number(impressionLimit).toLocaleString()} Impressions</td>
        </tr>
      </table>
    </div>

    <p style="font-size: 14px; line-height: 1.6; color: #475569;">
      Your wheel pop-up will run uninterrupted without the Free watermark and with full access to all your plan features.
    </p>

    <div class="btn-container">
      <a href="${appUrl}" class="btn">🚀 Open ConvertSpin Dashboard</a>
    </div>
  `;

  try {
    return await transport.sendMail({
      from: FROM_ADDRESS,
      to,
      subject: `🎉 Subscription Activated: ${planName} on ${shopDomain}`,
      html: wrapEmailHtml({
        title: "Your Subscription is Active",
        preheader: `Thank you for upgrading to ${planName}. Your wheel is ready to scale!`,
        contentHtml,
      }),
    });
  } catch (error) {
    console.error("[ConvertSpin Email] sendSubscriptionUpgradedEmail error:", error);
    return null;
  }
}

/**
 * 6. One-time announcement to existing Free stores introducing Auto-Scale.
 * Returns the nodemailer result, or null if SMTP isn't configured / sending failed.
 */
export async function sendAutoScaleAnnouncementEmail({ to, shopDomain, impressionsThisCycle = 0 }) {
  if (!to) return null;
  const transport = getTransporter();
  if (!transport) return null;

  const enableUrl = `https://${shopDomain}/admin/apps/${process.env.SHOPIFY_API_KEY}/app?upgrade=AUTO`;

  const contentHtml = `
    <p style="font-size: 15px; line-height: 1.6; color: #334155; margin-top: 0;">
      Hello Store Owner,
    </p>
    <p style="font-size: 15px; line-height: 1.6; color: #334155;">
      Your free plan on <strong>${shopDomain}</strong> includes 1,000 spin wheel impressions per 30 days. Once you reach that,
      the wheel pauses and you miss leads from new visitors until the next cycle.
    </p>
    <p style="font-size: 15px; line-height: 1.6; color: #334155;">
      <strong>Auto-Scale</strong> keeps your wheel running as your traffic grows. You approve it once and pay only for the volume you actually use:
    </p>

    <div class="stat-box">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 6px 0; color: #64748B; font-size: 14px;">Up to 1,000 impressions</td>
          <td style="padding: 6px 0; text-align: right; color: #10B981; font-weight: 700; font-size: 15px;">Free</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #64748B; font-size: 14px;">Up to 5,000</td>
          <td style="padding: 6px 0; text-align: right; color: #0F172A; font-weight: 700; font-size: 15px;">$2.99</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #64748B; font-size: 14px;">Up to 20,000</td>
          <td style="padding: 6px 0; text-align: right; color: #0F172A; font-weight: 700; font-size: 15px;">$5.99</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #64748B; font-size: 14px;">Up to 50,000</td>
          <td style="padding: 6px 0; text-align: right; color: #0F172A; font-weight: 700; font-size: 15px;">$9.99</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #64748B; font-size: 14px;">Up to 150,000</td>
          <td style="padding: 6px 0; text-align: right; color: #0F172A; font-weight: 700; font-size: 15px;">$19.99 maximum</td>
        </tr>
      </table>
    </div>

    <p style="font-size: 14px; line-height: 1.6; color: #475569;">
      Nothing is charged when you turn it on. Usage resets every 30 days, so quieter months cost less, and the total never exceeds $19.99 per cycle.
      ${impressionsThisCycle > 0 ? `This cycle your wheel has been shown <strong>${Number(impressionsThisCycle).toLocaleString()}</strong> times so far.` : ""}
      Charges appear on your regular Shopify bill, and you can cancel anytime.
    </p>

    <div class="btn-container">
      <a href="${enableUrl}" class="btn">Turn On Auto-Scale ($0 to start)</a>
    </div>

    <p style="text-align: center; font-size: 12px; color: #94A3B8; margin-top: 12px;">
      You're receiving this one-time notice because ConvertSpin is installed on ${shopDomain}. If you don't turn it on, nothing changes. You stay on the Free plan.
    </p>
  `;

  try {
    return await transport.sendMail({
      from: FROM_ADDRESS,
      to,
      subject: `New for ${shopDomain}: keep your spin wheel running with Auto-Scale`,
      html: wrapEmailHtml({
        title: "Never Let Your Spin Wheel Pause",
        preheader: "Free up to 1,000 impressions, then pay only for what you use. Max $19.99 per 30 days.",
        contentHtml,
      }),
    });
  } catch (error) {
    console.error("[ConvertSpin Email] sendAutoScaleAnnouncementEmail error:", error);
    return null;
  }
}

/**
 * 5. Notice when an Auto-Scale store moves into a higher usage tier and is billed for it
 */
export async function sendAutoScaleTierEmail({
  to,
  shopDomain,
  tierName,
  tierPrice,
  impressionLimit,
  currentImpressions,
}) {
  if (!to) return null;
  const transport = getTransporter();
  if (!transport) return null;

  const appUrl = `https://${shopDomain}/admin/apps/${process.env.SHOPIFY_API_KEY}/app/billing`;

  const contentHtml = `
    <p style="font-size: 15px; line-height: 1.6; color: #334155; margin-top: 0;">
      Hello Store Owner,
    </p>
    <p style="font-size: 15px; line-height: 1.6; color: #334155;">
      Your spin wheel on <strong>${shopDomain}</strong> is getting more traffic. Your Auto-Scale plan has moved up to
      <strong>${tierName}</strong> for this 30-day cycle, so your wheel keeps running with no interruption.
    </p>

    <div class="stat-box">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 6px 0; color: #64748B; font-size: 14px;">Impressions This Cycle</td>
          <td style="padding: 6px 0; text-align: right; color: #0F172A; font-weight: 700; font-size: 15px;">${Number(currentImpressions).toLocaleString()}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #64748B; font-size: 14px;">Current Tier</td>
          <td style="padding: 6px 0; text-align: right; color: #4F46E5; font-weight: 700; font-size: 15px;">${tierName} (up to ${Number(impressionLimit).toLocaleString()})</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #64748B; font-size: 14px;">This Cycle's Total</td>
          <td style="padding: 6px 0; text-align: right; color: #0F172A; font-weight: 700; font-size: 15px;">$${Number(tierPrice).toFixed(2)}</td>
        </tr>
      </table>
    </div>

    <p style="font-size: 14px; line-height: 1.6; color: #475569;">
      This is billed through your Shopify invoice under the Auto-Scale plan you approved, and never exceeds $19.99 per 30 days.
      Usage resets each cycle, so quieter months cost less. You can switch plans or cancel anytime from the billing page.
    </p>

    <div class="btn-container">
      <a href="${appUrl}" class="btn">View Usage &amp; Billing</a>
    </div>
  `;

  try {
    return await transport.sendMail({
      from: FROM_ADDRESS,
      to,
      subject: `ConvertSpin: ${shopDomain} moved to ${tierName} this cycle`,
      html: wrapEmailHtml({
        title: "Your Wheel Auto-Scaled",
        preheader: `${Number(currentImpressions).toLocaleString()} impressions this cycle. Now on ${tierName} ($${Number(tierPrice).toFixed(2)}).`,
        contentHtml,
      }),
    });
  } catch (error) {
    console.error("[ConvertSpin Email] sendAutoScaleTierEmail error:", error);
    return null;
  }
}
