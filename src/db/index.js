const { Pool } = require('pg');

// اتصال حقيقي دائم بقاعدة بيانات Supabase (Postgres) — البيانات هنا لا تنمسح أبداً
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      is_subscribed INTEGER NOT NULL DEFAULT 0,
      analysis_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS subscription_requests (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      method TEXT NOT NULL,
      tx_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  console.log('✅ قاعدة بيانات Supabase جاهزة (Postgres حقيقي ودائم)');
}

const ready = init();

module.exports = { pool, ready };
