// migrations/001_create_users_table.js
//
// ─── WHAT IS A MIGRATION? ────────────────────────────────────────────────────
// A migration is a versioned script that makes a specific change to your
// database schema. Think of it like Git commits — but for your database
// structure. Each migration file:
//   1. Has a number prefix so they always run in order (001, 002, 003...)
//   2. Does ONE specific thing (create a table, add a column, add an index...)
//   3. Is run ONCE manually (or by a deploy script), not on every server start
//
// HOW TO RUN THIS:
//   node migrations/001_create_users_table.js
//
// ─── WHY DID WE MOVE createTable() OUT OF db.js? ─────────────────────────────
// Having `createTable()` inside db.js meant it ran automatically every time
// the server started. Problems with that approach:
//   - Hard to track what changed and when
//   - As your app grows, db.js becomes a mess of table definitions
//   - No clear history of schema changes
//   - Can cause subtle bugs if the schema evolves over time
//
// With migrations, you have a clear paper trail of every database change.

import 'dotenv/config';
import pool from '../db.js';

async function migrate() {
  try {
    // ── Create the users table ───────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        user_id    SERIAL PRIMARY KEY,
        username   TEXT NOT NULL,
        email      TEXT UNIQUE NOT NULL,
        password   TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("✅ users table ready");

    // ── Priority 3: Add index on email column ────────────────────────────────
    // WHY DO WE NEED AN INDEX?
    //
    // Every time a user logs in or registers, your server runs:
    //   SELECT * FROM users WHERE email = $1
    //
    // Without an index, PostgreSQL does a "full table scan" — it reads EVERY
    // row in the users table to find the one matching email. With 10 users
    // that's fine. With 100,000 users that's very slow.
    //
    // An index is like the index at the back of a textbook. Instead of reading
    // every page to find "JWT", you jump straight to the right page.
    // PostgreSQL can find the matching email in milliseconds regardless of
    // how many users you have.
    //
    // `IF NOT EXISTS` makes this safe to run multiple times — it won't crash
    // or create a duplicate if the index already exists.
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users (email)
    `);
    console.log("✅ email index ready");

  } catch (err) {
    console.error("❌ Migration failed:", err.message);
    process.exit(1);
  } finally {
    // Always close the pool when the script finishes, otherwise Node.js hangs.
    await pool.end();
    console.log("Database connection closed");
  }
}

migrate();