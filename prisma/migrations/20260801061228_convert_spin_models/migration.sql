-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopifyDomain" TEXT NOT NULL,
    "accessToken" TEXT,
    "currentPlan" TEXT NOT NULL DEFAULT 'FREE',
    "monthlyImpressionsCount" INTEGER NOT NULL DEFAULT 0,
    "billingCycleStartDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usageSubscriptionLineItemId" TEXT,
    "klaviyoApiKey" TEXT,
    "mailchimpApiKey" TEXT,
    "sendgridApiKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'POPUP',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "isABTest" BOOLEAN NOT NULL DEFAULT false,
    "triggers" TEXT NOT NULL DEFAULT '{}',
    "themeSettings" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Campaign_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WheelSegment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "discountType" TEXT NOT NULL DEFAULT 'PERCENTAGE',
    "discountValue" TEXT NOT NULL DEFAULT '10',
    "winProbability" REAL NOT NULL DEFAULT 10.0,
    "hexColor" TEXT NOT NULL DEFAULT '#3B82F6',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WheelSegment_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "campaignId" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "wonCode" TEXT,
    "wonDiscountLabel" TEXT,
    "ipAddress" TEXT,
    "deviceType" TEXT DEFAULT 'desktop',
    "sessionHash" TEXT,
    "convertedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Lead_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Lead_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ImpressionLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "campaignId" TEXT,
    "sessionHash" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ImpressionLog_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ImpressionLog_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Shop_shopifyDomain_key" ON "Shop"("shopifyDomain");

-- CreateIndex
CREATE INDEX "Lead_shopId_email_idx" ON "Lead"("shopId", "email");

-- CreateIndex
CREATE INDEX "Lead_shopId_phone_idx" ON "Lead"("shopId", "phone");

-- CreateIndex
CREATE INDEX "ImpressionLog_shopId_timestamp_idx" ON "ImpressionLog"("shopId", "timestamp");
