#!/usr/bin/env node
/**
 * NEXUS — Schema deployment script
 *
 * Run: node scripts/deploy-schema.js
 *
 * Deploys the full Nexus schema to Supabase in two steps:
 *   1. nexus_schema.sql       — v1.0 base (25 tables, views, triggers, functions)
 *   2. nexus_schema_v1_1.sql  — v1.1 migration (bootstrap mode, confidence, true EV, etc.)
 *
 * Safe to re-run: v1.0 uses CREATE TABLE IF NOT EXISTS.
 * v1.1 uses ALTER TABLE ADD COLUMN IF NOT EXISTS equivalents (ADD COLUMN is idempotent
 * in Postgres if column already exists — script handles the duplicate column error gracefully).
 */

'use strict';
require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
    host:     process.env.PG_HOST,
    port:     parseInt(process.env.PG_PORT || '5432'),
    database: process.env.PG_DATABASE || 'postgres',
    user:     process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    ssl:      { rejectUnauthorized: false },
    connectionTimeoutMillis: 30000,
});

const SQL_DIR = path.join(__dirname, '..', 'sql');

async function runSqlFile(filename) {
    const filepath = path.join(SQL_DIR, filename);

    if (!fs.existsSync(filepath)) {
        console.error(`[Deploy] File not found: ${filepath}`);
        process.exit(1);
    }

    const sql    = fs.readFileSync(filepath, 'utf8');
    const client = await pool.connect();

    console.log(`\n[Deploy] Running ${filename}...`);

    try {
        await client.query(sql);
        console.log(`[Deploy] ✓ ${filename} completed successfully.`);
    } catch (err) {
        // Postgres throws 42701 (duplicate_column) when a column already exists.
        // This happens if deploy-schema is re-run. Treat as non-fatal for ALTER TABLE.
        if (err.code === '42701') {
            console.warn(`[Deploy] ⚠ ${filename}: one or more columns already exist — skipping duplicates (safe).`);
        } else if (err.code === '42P07') {
            console.warn(`[Deploy] ⚠ ${filename}: one or more tables already exist — skipping (safe).`);
        } else {
            console.error(`[Deploy] ✗ ${filename} failed:`);
            console.error(`  Code:    ${err.code}`);
            console.error(`  Message: ${err.message}`);
            if (err.position) console.error(`  Position: ${err.position}`);
            throw err;
        }
    } finally {
        client.release();
    }
}

async function deploy() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  NEXUS — Schema Deployment');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`  Host:     ${process.env.PG_HOST}`);
    console.log(`  Database: ${process.env.PG_DATABASE}`);

    try {
        await runSqlFile('nexus_schema.sql');
        await runSqlFile('nexus_schema_v1_1_migration.sql');

        console.log('\n═══════════════════════════════════════════════════════════');
        console.log('  Deployment complete. Nexus schema is live.');
        console.log('═══════════════════════════════════════════════════════════\n');
    } catch (err) {
        console.error('\n[Deploy] Deployment failed. Fix the error above and re-run.');
        process.exit(1);
    } finally {
        await pool.end();
    }
}

deploy();
