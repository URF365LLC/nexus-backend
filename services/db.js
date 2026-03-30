'use strict';
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    host:     process.env.PG_HOST,
    port:     parseInt(process.env.PG_PORT || '5432'),
    database: process.env.PG_DATABASE || 'postgres',
    user:     process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    ssl:      { rejectUnauthorized: false },
    max:      20,
    idleTimeoutMillis:    10000,
    connectionTimeoutMillis: 30000,
});

pool.on('error', (err) => {
    console.error('[DB] Idle client error:', err.message);
});

const db = {
    async query(text, params = []) {
        return pool.query(text, params);
    },

    async get(text, params = []) {
        const result = await pool.query(text, params);
        return result.rows[0] || null;
    },

    async all(text, params = []) {
        const result = await pool.query(text, params);
        return result.rows;
    },

    async run(text, params = []) {
        const result = await pool.query(text, params);
        return {
            rowCount: result.rowCount,
            rows:     result.rows,
            lastId:   result.rows?.[0]?.id || null,
        };
    },

    async exec(text) {
        const client = await pool.connect();
        try {
            await client.query(text);
        } finally {
            client.release();
        }
    },

    async transaction(fn) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const result = await fn(client);
            await client.query('COMMIT');
            return result;
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    },
};

module.exports = { db, pool };
