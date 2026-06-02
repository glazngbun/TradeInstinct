import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser'; // NEW: reads cookies from incoming requests
import pool from './db.js';
import authRoutes from './routes/AuthRoutes.js'
import DashboardRoutes from './routes/DashboardRoutes.js'

const app = express();
const PORT = 5000;

// ─── CORS CONFIGURATION ──────────────────────────────────────────────────────
// Priority 2: Lock CORS to your specific frontend origin only.
// Before this change, `cors()` with no options allowed ANY website to send
// requests to your server — a huge security hole. Now only your React app
// (running on localhost:5173 in dev) is allowed.
//
// `credentials: true` is REQUIRED when using HTTP-only cookies. Without it,
// the browser will refuse to send cookies cross-origin, even if the origin is
// whitelisted.
app.use(cors({
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  credentials: true,  // allows cookies to be sent with cross-origin requests
}));

app.use(express.json());
app.use(cookieParser()); // NEW: must come after express() setup, parses req.cookies

app.get("/", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).send(err.message);
  }
});

app.use("/auth", authRoutes);
app.use("/dashboard", DashboardRoutes)

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});