import prisma from "../db.server";
import { sendAutoScaleAnnouncementEmail } from "./email.server";

// Sent per click so the request stays well under proxy timeouts and SMTP rate limits.
export const ANNOUNCEMENT_BATCH_SIZE = 50;
const DELAY_BETWEEN_EMAILS_MS = 400;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Free-plan stores that still have the app installed (an offline session exists),
 * have a contact email, and haven't received the announcement yet.
 */
export async function getAnnouncementRecipients(limit) {
  const installed = await prisma.session.findMany({
    where: { isOnline: false },
    select: { shop: true },
    distinct: ["shop"],
  });
  const installedDomains = installed.map((s) => s.shop);
  if (installedDomains.length === 0) return [];

  return prisma.shop.findMany({
    where: {
      shopifyDomain: { in: installedDomains },
      currentPlan: "FREE",
      contactEmail: { not: null },
      autoScaleAnnouncedAt: null,
    },
    select: {
      id: true,
      shopifyDomain: true,
      contactEmail: true,
      monthlyImpressionsCount: true,
    },
    orderBy: { monthlyImpressionsCount: "desc" }, // busiest stores first
    ...(limit ? { take: limit } : {}),
  });
}

export async function countAnnouncementRecipients() {
  return (await getAnnouncementRecipients()).length;
}

/**
 * Send the next batch. Each store is marked only after its email succeeds,
 * so clicking again resumes where it stopped and never double-sends.
 */
export async function sendAnnouncementBatch() {
  const recipients = await getAnnouncementRecipients(ANNOUNCEMENT_BATCH_SIZE);
  let sent = 0;
  const failed = [];

  for (const shop of recipients) {
    const result = await sendAutoScaleAnnouncementEmail({
      to: shop.contactEmail,
      shopDomain: shop.shopifyDomain,
      impressionsThisCycle: shop.monthlyImpressionsCount || 0,
    });

    if (result) {
      await prisma.shop.update({
        where: { id: shop.id },
        data: { autoScaleAnnouncedAt: new Date() },
      });
      sent++;
    } else {
      failed.push(shop.shopifyDomain);
    }

    await sleep(DELAY_BETWEEN_EMAILS_MS);
  }

  return { sent, failed, remaining: await countAnnouncementRecipients() };
}

/** Preview: send the announcement to any address without marking a store. */
export async function sendAnnouncementTest(to, sampleShopDomain) {
  const result = await sendAutoScaleAnnouncementEmail({
    to,
    shopDomain: sampleShopDomain || "your-store.myshopify.com",
    impressionsThisCycle: 640,
  });
  return Boolean(result);
}
