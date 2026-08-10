import prisma from "../db.server";

/**
 * Server-side anti-cheat verification
 */
export async function validateSpinEligibility(shopId, campaignId, email, phone, ipAddress, sessionHash) {
  // 1. Check if email already registered for this shop/campaign
  if (email) {
    const existingEmailLead = await prisma.lead.findFirst({
      where: {
        shopId,
        email: email.trim().toLowerCase(),
      },
    });

    if (existingEmailLead) {
      return {
        allowed: false,
        reason: "You have already claimed a discount with this email address.",
        existingCode: existingEmailLead.wonCode,
      };
    }
  }

  // 2. Check if phone already registered
  if (phone) {
    const existingPhoneLead = await prisma.lead.findFirst({
      where: {
        shopId,
        phone: phone.trim(),
      },
    });

    if (existingPhoneLead) {
      return {
        allowed: false,
        reason: "You have already claimed a discount with this phone number.",
        existingCode: existingPhoneLead.wonCode,
      };
    }
  }

  // 3. IP Rate Limiting (max 3 spins per IP per hour)
  if (ipAddress) {
    const recentIpLeadsCount = await prisma.lead.count({
      where: {
        shopId,
        ipAddress,
        convertedAt: {
          gte: new Date(Date.now() - 3600 * 1000),
        },
      },
    });

    if (recentIpLeadsCount >= 3) {
      return {
        allowed: false,
        reason: "Maximum spin attempts exceeded from your network. Please try again later.",
      };
    }
  }

  return { allowed: true };
}

/**
 * Pick winning segment based on probability weight distribution
 */
export function selectWeightedSegment(segments) {
  if (!segments || segments.length === 0) return null;

  // Total probability sum
  const totalWeight = segments.reduce((sum, seg) => sum + (seg.winProbability || 0), 0);
  
  if (totalWeight <= 0) {
    return segments[Math.floor(Math.random() * segments.length)];
  }

  const random = Math.random() * totalWeight;
  let cumulative = 0;

  for (let i = 0; i < segments.length; i++) {
    cumulative += segments[i].winProbability;
    if (random <= cumulative) {
      return { segment: segments[i], index: i };
    }
  }

  return { segment: segments[segments.length - 1], index: segments.length - 1 };
}
