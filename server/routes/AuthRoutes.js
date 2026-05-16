import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pool from "../db.js";
import validator from 'validator';
import authMiddleware from "../middleware/AuthMiddleware.js"

const router = express.Router();

// ─── COOKIE CONFIGURATION ────────────────────────────────────────────────────
// Priority 1: HTTP-only cookie settings.
//
// WHY ARE WE DOING THIS?
// Before, we sent the JWT token in the response body and the frontend saved it
// in localStorage. The problem: ANY JavaScript running on your page can read
// localStorage — including malicious scripts injected via XSS attacks.
//
// An HTTP-only cookie CANNOT be read by JavaScript at all. The browser stores
// it silently and sends it automatically with every request to your server.
// This completely eliminates the XSS token-theft risk.
//
// COOKIE OPTIONS EXPLAINED:
// - httpOnly: true       → JS cannot read this cookie (the whole point)
// - secure: true         → cookie only sent over HTTPS (in production)
// - sameSite: 'strict'   → cookie not sent on cross-site requests (CSRF protection)
// - maxAge              → how long the cookie lives in the browser (milliseconds)
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production', // false in dev (no HTTPS locally)
  sameSite: 'strict',
  maxAge: 60 * 60 * 1000, // 1 hour in milliseconds (matches JWT expiry)
};

// GET /auth/me
// Called by React on every page load to check if user is still logged in.
// authMiddleware runs first — if cookie is missing or expired, it returns 401
// before this handler even executes.
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const user = await pool.query(
      "SELECT user_id, username, email, created_at FROM users WHERE user_id = $1",
      [req.user.user_id]  // req.user was attached by authMiddleware
    );

    if (user.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ user: user.rows[0] });

  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: "All fields required" });
    }

    if (username.trim().length <= 0) {
      return res.status(400).json({ error: "Enter valid username" });
    }

    const checkEmail = validator.isEmail(email, { require_tld: true });
    if (!checkEmail) {
      return res.status(400).json({ error: "Enter valid email" });
    }

    if (password.trim().length === 0 || password.length < 8) {
      return res.status(400).json({ error: "Invalid password or password is too short" });
    }

    const userExists = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    if (userExists.rows.length > 0) {
      return res.status(400).json({ error: "User already exists" });
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const newUser = await pool.query(
      "INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING user_id, email, username",
      [username, email, hashedPassword]
    );

    const token = jwt.sign(
      { user_id: newUser.rows[0].user_id },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    // Priority 1: Set token as HTTP-only cookie instead of returning it in body.
    // The frontend no longer receives or stores the token — the browser handles it.
    res.cookie('token', token, COOKIE_OPTIONS);

    // We still send back user info (not the token) so the frontend can show
    // the user's name, email etc. without needing to decode the JWT.
    res.status(201).json({
      user: {
        user_id: newUser.rows[0].user_id,
        email: newUser.rows[0].email,
        username: newUser.rows[0].username,
      }
    });

  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── LOGIN ───────────────────────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    if (user.rows.length === 0) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const validPassword = await bcrypt.compare(password, user.rows[0].password);

    if (!validPassword) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      { user_id: user.rows[0].user_id },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    // Priority 1: Same as register — set cookie, don't expose token in body.
    res.cookie('token', token, COOKIE_OPTIONS);

    res.json({
      user: {
        user_id: user.rows[0].user_id,
        email: user.rows[0].email,
        username: user.rows[0].username,
      }
    });

  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Server error" });
  }
});


router.post("/logout", (req, res) => {
  res.clearCookie('token', COOKIE_OPTIONS);
  res.json({ message: "Logged out successfully" });
});

export default router;