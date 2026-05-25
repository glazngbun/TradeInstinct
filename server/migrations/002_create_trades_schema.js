import 'dotenv/config';
import pool from '../db.js';

async function migrate() {
  const client = await pool.connect();

  try {
    // Start transaction
    await client.query('BEGIN');

    // ─────────────────────────────────────────────────────────────
    // TABLE 1: upload_sessions
    // Tracks each CSV upload event
    // ─────────────────────────────────────────────────────────────

    await client.query(`
      CREATE TABLE IF NOT EXISTS upload_sessions (
        session_id   SERIAL PRIMARY KEY,
        user_id      INTEGER NOT NULL
                     REFERENCES users(user_id)
                     ON DELETE CASCADE,

        filename     TEXT NOT NULL,

        file_hash    TEXT NOT NULL,

        row_count    INTEGER,

        status       TEXT DEFAULT 'processing'
                     CHECK (status IN ('processing', 'done', 'failed')),

        uploaded_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

        UNIQUE(user_id, file_hash)
      );
    `);

    console.log(' upload_sessions table ready');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sessions_user_id
      ON upload_sessions(user_id);
    `);

    console.log(' session indexes ready');

    // ─────────────────────────────────────────────────────────────
    // TABLE 2: trades
    // Immutable raw trade records
    // ─────────────────────────────────────────────────────────────

    await client.query(`
      CREATE TABLE IF NOT EXISTS trades (
        trade_id     SERIAL PRIMARY KEY,

        session_id   INTEGER NOT NULL
                     REFERENCES upload_sessions(session_id)
                     ON DELETE CASCADE,

        user_id      INTEGER NOT NULL
                     REFERENCES users(user_id)
                     ON DELETE CASCADE,

        executed_at  TIMESTAMP NOT NULL,

        ticker       TEXT NOT NULL,

        action       TEXT NOT NULL
                     CHECK (action IN ('BUY', 'SELL')),

        quantity     INTEGER NOT NULL
                     CHECK (quantity > 0),

        price        NUMERIC(10, 2) NOT NULL
                     CHECK (price > 0),

        fees         NUMERIC(10, 2) NOT NULL
                     DEFAULT 0
                     CHECK (fees >= 0),

        trade_hash   TEXT NOT NULL,

        created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

        UNIQUE(user_id, trade_hash)
      );
    `);

    console.log(' trades table ready');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_trades_user_id
      ON trades(user_id);

      CREATE INDEX IF NOT EXISTS idx_trades_session_id
      ON trades(session_id);

      CREATE INDEX IF NOT EXISTS idx_trades_ticker
      ON trades(ticker);

      CREATE INDEX IF NOT EXISTS idx_trades_executed_at
      ON trades(executed_at);

      CREATE INDEX IF NOT EXISTS idx_trades_user_executed
      ON trades(user_id, executed_at);
    `);

    console.log(' trade indexes ready');

    // ─────────────────────────────────────────────────────────────
    // TABLE 3: behavioral_flags
    // Derived behavioral analysis layer
    // ─────────────────────────────────────────────────────────────

    await client.query(`
      CREATE TABLE IF NOT EXISTS behavioral_flags (
        flag_id      SERIAL PRIMARY KEY,

        trade_id     INTEGER NOT NULL
                     REFERENCES trades(trade_id)
                     ON DELETE CASCADE,

        user_id      INTEGER NOT NULL
                     REFERENCES users(user_id)
                     ON DELETE CASCADE,

        flag_type    TEXT NOT NULL
                     CHECK (
                       flag_type IN (
                         'REVENGE_TRADE',
                         'PANIC_SELL',
                         'FOMO'
                       )
                     ),

        confidence   NUMERIC(3, 2)
                     CHECK (confidence BETWEEN 0 AND 1),

        metadata     JSONB,

        created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log(' behavioral_flags table ready');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_flags_user_id
      ON behavioral_flags(user_id);

      CREATE INDEX IF NOT EXISTS idx_flags_trade_id
      ON behavioral_flags(trade_id);

      CREATE INDEX IF NOT EXISTS idx_flags_type
      ON behavioral_flags(flag_type);
    `);

    console.log('✅ behavioral indexes ready');

    // Commit transaction
    await client.query('COMMIT');

    console.log(' Migration completed successfully');

  } catch (err) {

    // Rollback all changes if ANY query fails
    await client.query('ROLLBACK');

    console.error('Migration failed');
    console.error(err.message);

    process.exit(1);

  } finally {

    // Release client back to pool
    client.release();

    // Close pool
    await pool.end();

    console.log(' Database connection closed');
  }
}

migrate();


