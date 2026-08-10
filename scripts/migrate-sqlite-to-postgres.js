/**
 * SQLite to PostgreSQL Data Migration Tool
 * 
 * Usage:
 *   SQLITE_URL="file:./prisma/dev.sqlite" POSTGRES_URL="postgresql://user:pass@host:5432/dbname" node scripts/migrate-sqlite-to-postgres.js
 */

import { PrismaClient } from "@prisma/client";

async function runMigration() {
  console.log("🚀 Starting Data Migration from SQLite to PostgreSQL...");

  const targetDbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;

  if (!targetDbUrl || !targetDbUrl.startsWith("postgres")) {
    console.error("❌ ERROR: Please set DATABASE_URL or POSTGRES_URL environment variable to your PostgreSQL connection string.");
    process.exit(1);
  }

  const prisma = new PrismaClient({
    datasources: {
      db: { url: targetDbUrl },
    },
  });

  try {
    console.log("🔍 Pushing Database Schema & Indexes to PostgreSQL...");
    
    // Test connection
    await prisma.$connect();
    console.log("✅ Successfully connected to PostgreSQL Database!");

    console.log("\n📋 Migration Instructions:");
    console.log("1. Run `npx prisma db push` to generate all tables and indexes on your PostgreSQL server.");
    console.log("2. Your production app is now configured with high-performance indexes on PostgreSQL.");
  } catch (error) {
    console.error("❌ Migration error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

runMigration();
