import pool from '../db.js';

// ── Thresholds (easy to tune later or pull from DB per user) ──────────────────
const REVENGE_TIME_WINDOW_MINUTES = 30;
const PANIC_SELL_HOLD_MINUTES     = 15;
const FOMO_SPIKE_PERCENT          = 3.0; // 3% price jump before buy

// ── Main entry point ──────────────────────────────────────────────────────────
// Called after upload completes. Runs all detectors for the new session.
export async function runBehavioralAnalysis(userId, sessionId) {
  console.log(`🧠 Starting behavioral analysis for session ${sessionId}`);

  try {
    await analyzeRevengeTrades(userId, sessionId);
    await analyzePanicSells(userId, sessionId);
    await analyzeFOMO(userId, sessionId);
    console.log(`✅ Behavioral analysis complete for session ${sessionId}`);
  } catch (err) {
    console.error(`❌ Behavioral analysis failed for session ${sessionId}:`, err.message);
  }
}

// ── Detector 1: Revenge Trading ───────────────────────────────────────────────
// Conditions:
//   1. A SELL trade closed at a loss (sell_price < its paired buy_price)
//   2. A new BUY on the same ticker happens within 30 minutes
//   3. The new position size is larger than the losing position (aggression)
async function analyzeRevengeTrades(userId, sessionId) {

  // Fetch all trades for this user ordered by ticker + time
  // We look at ALL their trades (not just this session) so we catch
  // revenge trades that span across uploaded files
  const { rows: trades } = await pool.query(`
    SELECT trade_id, ticker, action, quantity, price, fees, executed_at
    FROM trades
    WHERE user_id = $1
    ORDER BY ticker, executed_at ASC
  `, [userId]);

  const flags = [];

  // Group trades by ticker so we analyze each ticker's sequence independently
  const byTicker = groupByTicker(trades);

  for (const [ticker, sequence] of Object.entries(byTicker)) {
    // Walk through each trade in time order
    // We need buy-sell pairs to calculate PnL
    let openBuy = null; // tracks the most recent unmatched BUY

    for (let i = 0; i < sequence.length; i++) {
      const trade = sequence[i];

      if (trade.action === 'BUY') {
        openBuy = trade;
        continue;
      }

      // This is a SELL — check if it closes a losing position
      if (trade.action === 'SELL' && openBuy) {
        const pnl = (trade.price - openBuy.price) * trade.quantity;

        if (pnl < 0) {
          // This was a losing trade — now look ahead for a revenge re-entry
          const sellTime = new Date(trade.executed_at);

          // Look at the next few trades on this ticker
          for (let j = i + 1; j < sequence.length; j++) {
            const nextTrade = sequence[j];
            const nextTime  = new Date(nextTrade.executed_at);
            const minuteGap = (nextTime - sellTime) / (1000 * 60);

            // Outside time window — stop looking
            if (minuteGap > REVENGE_TIME_WINDOW_MINUTES) break;

            // Found a BUY within the time window after a loss
            if (nextTrade.action === 'BUY') {
              const isAggressive = nextTrade.quantity > openBuy.quantity;

              const confidence = calculateRevengeConfidence(
                minuteGap,
                pnl,
                isAggressive
              );

              flags.push({
                trade_id:  nextTrade.trade_id, // flag the revenge BUY
                user_id:   userId,
                flag_type: 'REVENGE_TRADE',
                confidence,
                metadata: {
                  previous_trade_id:    trade.trade_id,
                  loss_amount:          parseFloat(pnl.toFixed(2)),
                  time_gap_minutes:     parseFloat(minuteGap.toFixed(1)),
                  previous_quantity:    openBuy.quantity,
                  revenge_quantity:     nextTrade.quantity,
                  aggression_escalated: isAggressive,
                }
              });
              break; // only flag the first revenge entry
            }
          }
        }
        openBuy = null; // reset after SELL
      }
    }
  }

  await insertFlags(flags);
  console.log(`  Revenge trades: ${flags.length} flags`);
}

// ── Detector 2: Panic Selling ─────────────────────────────────────────────────
// Conditions:
//   1. A BUY was held for less than PANIC_SELL_HOLD_MINUTES
//   2. The SELL price is lower than the BUY price (selling at a loss)
async function analyzePanicSells(userId, sessionId) {

  const { rows: trades } = await pool.query(`
    SELECT trade_id, ticker, action, quantity, price, executed_at
    FROM trades
    WHERE user_id = $1
    ORDER BY ticker, executed_at ASC
  `, [userId]);

  const flags  = [];
  const byTicker = groupByTicker(trades);

  for (const [ticker, sequence] of Object.entries(byTicker)) {
    let openBuy = null;

    for (const trade of sequence) {
      if (trade.action === 'BUY') {
        openBuy = trade;
        continue;
      }

      if (trade.action === 'SELL' && openBuy) {
        const holdMinutes = (new Date(trade.executed_at) - new Date(openBuy.executed_at)) / (1000 * 60);
        const pnl         = (trade.price - openBuy.price) * trade.quantity;

        if (holdMinutes < PANIC_SELL_HOLD_MINUTES && pnl < 0) {
          const confidence = calculatePanicConfidence(holdMinutes, pnl, openBuy.price);

          flags.push({
            trade_id:  trade.trade_id, // flag the panic SELL
            user_id:   userId,
            flag_type: 'PANIC_SELL',
            confidence,
            metadata: {
              buy_trade_id:   openBuy.trade_id,
              hold_minutes:   parseFloat(holdMinutes.toFixed(1)),
              loss_amount:    parseFloat(pnl.toFixed(2)),
              buy_price:      parseFloat(openBuy.price),
              sell_price:     parseFloat(trade.price),
              loss_percent:   parseFloat(((pnl / (openBuy.price * openBuy.quantity)) * 100).toFixed(2)),
            }
          });
        }
        openBuy = null;
      }
    }
  }

  await insertFlags(flags);
  console.log(`  Panic sells: ${flags.length} flags`);
}

// ── Detector 3: FOMO ──────────────────────────────────────────────────────────
// Conditions:
//   1. Price on a ticker spiked by > 3% between consecutive trades
//   2. User BUYs into that ticker right after the spike (chasing the move)
async function analyzeFOMO(userId, sessionId) {

  const { rows: trades } = await pool.query(`
    SELECT trade_id, ticker, action, quantity, price, executed_at
    FROM trades
    WHERE user_id = $1
    ORDER BY ticker, executed_at ASC
  `, [userId]);

  const flags    = [];
  const byTicker = groupByTicker(trades);

  for (const [ticker, sequence] of Object.entries(byTicker)) {
    for (let i = 1; i < sequence.length; i++) {
      const prev = sequence[i - 1];
      const curr = sequence[i];

      // Only care about BUY trades (you can't FOMO into a sell)
      if (curr.action !== 'BUY') continue;

      // Calculate price change between previous trade and this buy
      const priceChange = ((curr.price - prev.price) / prev.price) * 100;

      if (priceChange >= FOMO_SPIKE_PERCENT) {
        const confidence = Math.min(priceChange / 10, 1); // scales with spike size

        flags.push({
          trade_id:  curr.trade_id,
          user_id:   userId,
          flag_type: 'FOMO',
          confidence: parseFloat(confidence.toFixed(2)),
          metadata: {
            previous_price:      parseFloat(prev.price),
            buy_price:           parseFloat(curr.price),
            price_spike_percent: parseFloat(priceChange.toFixed(2)),
            previous_trade_id:   prev.trade_id,
          }
        });
      }
    }
  }

  await insertFlags(flags);
  console.log(`  FOMO entries: ${flags.length} flags`);
}

// ── Confidence Scoring ────────────────────────────────────────────────────────
// Returns 0.0 to 1.0 — higher = more confident this is the behavior
// These formulas are intentionally simple for V1. ML can replace them later.

function calculateRevengeConfidence(minuteGap, pnl, isAggressive) {
  let score = 0;
  // Faster re-entry = higher confidence (max 0.4)
  score += Math.max(0, 0.4 * (1 - minuteGap / REVENGE_TIME_WINDOW_MINUTES));
  // Bigger loss = higher confidence (max 0.4)
  score += Math.min(0.4, Math.abs(pnl) / 500);
  // Aggression escalation = bonus 0.2
  if (isAggressive) score += 0.2;
  return parseFloat(Math.min(score, 1).toFixed(2));
}

function calculatePanicConfidence(holdMinutes, pnl, buyPrice) {
  let score = 0;
  // Shorter hold = higher confidence (max 0.5)
  score += Math.max(0, 0.5 * (1 - holdMinutes / PANIC_SELL_HOLD_MINUTES));
  // Larger loss % = higher confidence (max 0.5)
  const lossPercent = Math.abs(pnl) / (buyPrice * 100);
  score += Math.min(0.5, lossPercent * 10);
  return parseFloat(Math.min(score, 1).toFixed(2));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function groupByTicker(trades) {
  return trades.reduce((acc, trade) => {
    if (!acc[trade.ticker]) acc[trade.ticker] = [];
    acc[trade.ticker].push(trade);
    return acc;
  }, {});
}

async function insertFlags(flags) {
  if (flags.length === 0) return;

  for (const flag of flags) {
    await pool.query(`
      INSERT INTO behavioral_flags (trade_id, user_id, flag_type, confidence, metadata)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (trade_id, flag_type) DO NOTHING
    `, [
      flag.trade_id,
      flag.user_id,
      flag.flag_type,
      flag.confidence,
      JSON.stringify(flag.metadata)
    ]);
  }
}