import express        from "express";
import csv            from "csv-parser";
import { Readable }   from "stream";
import crypto         from "crypto";
import pool           from "../db.js";
import authMiddleware from "../middleware/AuthMiddleware.js";
import { upload }     from "../middleware/MulterMiddleware.js";

const router = express.Router();

// ── Row validator ─────────────────────────────────────────────────────────────
// Called on every parsed CSV row before it touches the database.
// Returns { valid: true, data: cleanedRow } or { valid: false, reason: "..." }
function validateRow(row, rowIndex) {
  const ticker = row.ticker?.trim().toUpperCase();
  const action = row.action?.trim().toUpperCase();
  const qty    = parseInt(row.quantity);
  const price  = parseFloat(row.price);
  const fees   = parseFloat(row.fees ?? 0);
  const dt     = new Date(`${row.date}T${row.time}`);

  if (!ticker || ticker.length > 10)
    return { valid: false, reason: `Row ${rowIndex}: invalid ticker` };

  if (!["BUY", "SELL"].includes(action))
    return { valid: false, reason: `Row ${rowIndex}: action must be BUY or SELL` };

  if (isNaN(qty) || qty <= 0)
    return { valid: false, reason: `Row ${rowIndex}: invalid quantity` };

  if (isNaN(price) || price <= 0)
    return { valid: false, reason: `Row ${rowIndex}: invalid price` };

  if (isNaN(fees) || fees < 0)
    return { valid: false, reason: `Row ${rowIndex}: invalid fees` };

  if (isNaN(dt.getTime()))
    return { valid: false, reason: `Row ${rowIndex}: invalid date/time` };

  return { valid: true, data: { ticker, action, qty, price, fees, dt } };
}

// ── Batch inserter ────────────────────────────────────────────────────────────
// Inserts up to BATCH_SIZE rows in a single query instead of one query per row.
// This reduces 1000 DB round-trips to just 10 (with batch size 100).
const BATCH_SIZE = 100;

async function insertBatch(client, batch, sessionId, userId) {
  if (batch.length === 0) return;

  // Build a single INSERT with multiple value tuples:
  // INSERT INTO trades (...) VALUES ($1,$2,...),($8,$9,...),($15,$16,...)
  const values = [];
  const placeholders = batch.map((row, i) => {
    const offset = i * 9;
    const hash = crypto
      .createHash("sha256")
      .update(`${userId}-${row.dt.toISOString()}-${row.ticker}-${row.action}-${row.qty}-${row.price}`)
      .digest("hex");

    values.push(sessionId, userId, row.dt, row.ticker, row.action, row.qty, row.price, row.fees, hash);

    // 9 params per row
    return `($${offset+1},$${offset+2},$${offset+3},$${offset+4},$${offset+5},$${offset+6},$${offset+7},$${offset+8},$${offset+9})`;
  });

  await client.query(
    `INSERT INTO trades
       (session_id, user_id, executed_at, ticker, action, quantity, price, fees, trade_hash)
     VALUES ${placeholders.join(",")}
     ON CONFLICT (user_id, trade_hash) DO NOTHING`,
    values
  );
}

// ── Upload route ──────────────────────────────────────────────────────────────
router.post("/upload-csv", authMiddleware, upload.single("csvFile"), async (req, res) => {

  console.log("user_id type:", typeof req.user.user_id, "value:", req.user.user_id);//temporary


  const client = await pool.connect(); // single transaction for whole upload

  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }

    const userId   = req.user.user_id;
    const filename = req.file.originalname;

    // ── File-level duplicate check ──────────────────────────────────────────
    // Hash the entire file buffer — if this user uploaded this exact file
    // before, reject it immediately before parsing a single row.
    const fileHash = crypto
      .createHash("sha256")
      .update(req.file.buffer)
      .digest("hex");

    const alreadyUploaded = await client.query(
      "SELECT session_id FROM upload_sessions WHERE user_id = $1 AND file_hash = $2",
      [userId, fileHash]
    );

    if (alreadyUploaded.rows.length > 0) {
      return res.status(409).json({ success: false, message: "This file has already been uploaded" });
    }

    // ── Create upload session ───────────────────────────────────────────────
    await client.query("BEGIN");

    const sessionResult = await client.query(
      `INSERT INTO upload_sessions (user_id, filename, file_hash, status)
       VALUES ($1, $2, $3, 'processing') RETURNING session_id`,
      [userId, filename, fileHash]
    );

    const sessionId = sessionResult.rows[0].session_id;

    // ── Stream parse the buffer ─────────────────────────────────────────────
    // Convert the memory buffer to a readable stream so csv-parser can
    // process it row by row without loading everything into an array.
    const errors     = [];
    let batch        = [];
    let rowIndex     = 0;
    let insertedCount = 0;

    await new Promise((resolve, reject) => {
      Readable.from(req.file.buffer)
        .pipe(csv())

        .on("data", async function(row) {
          rowIndex++;
          const result = validateRow(row, rowIndex);

          if (!result.valid) {
            errors.push(result.reason);
            return;
          }

          batch.push(result.data);

          // When batch is full, pause stream, insert, then resume
          if (batch.length >= BATCH_SIZE) {
            this.pause();
            const currentBatch = [...batch];
            batch = [];
            try {
              await insertBatch(client, currentBatch, sessionId, userId);
              insertedCount += currentBatch.length;
            } catch (err) {
              reject(err);
            }
            this.resume();
          }
        })

        .on("end", async () => {
          try {
            // Insert any remaining rows under BATCH_SIZE
            await insertBatch(client, batch, sessionId, userId);
            insertedCount += batch.length;
            resolve();
          } catch (err) {
            reject(err);
          }
        })

        .on("error", reject);
    });

    // ── Finalise session ────────────────────────────────────────────────────
    await client.query(
      "UPDATE upload_sessions SET status = 'done', row_count = $1 WHERE session_id = $2",
      [insertedCount, sessionId]
    );

    await client.query("COMMIT");

    res.json({
      success: true,
      message: `Uploaded ${insertedCount} trades (${errors.length} rows skipped)`,
      skipped_errors: errors.slice(0, 10), // show first 10 errors max
    });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err.message);

    // Mark session as failed if it was created
    try {
      await pool.query(
        "UPDATE upload_sessions SET status = 'failed' WHERE user_id = $1 AND status = 'processing'",
        [req.user.user_id]
      );
    } catch (_) {}

    res.status(500).json({ success: false, message: "Upload failed" });

  } finally {
    client.release();
  }
});

export default router;