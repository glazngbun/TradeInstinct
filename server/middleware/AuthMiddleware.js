import jwt from 'jsonwebtoken';

// ─── AUTH MIDDLEWARE ──────────────────────────────────────────────────────────
// WHAT IS MIDDLEWARE?
// Middleware is a function that runs BETWEEN the incoming request and your route
// handler. Think of it like a security guard at a door — every request must
// pass through before reaching protected routes.
//
// WHAT CHANGED?
// Before, we expected the frontend to manually attach the token in an
// "Authorization: Bearer <token>" header. That only works if the frontend
// can READ the token from localStorage.
//
// Now the token lives in an HTTP-only cookie. The browser automatically
// attaches cookies to every request — we don't need the frontend to do
// anything manually. We just read req.cookies.token instead.
function authMiddleware(req, res, next) {
  try {
    // req.cookies is populated by the cookie-parser middleware in server.js
    const token = req.cookies.token;

    if (!token) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    // jwt.verify throws an error if the token is expired or tampered with.
    // If it passes, `decoded` contains the payload we put in at sign time:
    // { user_id: ... }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach the user info to the request object so route handlers can use it.
    // e.g. in a protected route: const { user_id } = req.user;
    req.user = { user_id: decoded.user_id };

    next(); // everything checks out — proceed to the route handler

  } catch (err) {
    console.error(err);
    res.status(401).json({ error: "Unauthorized" });
  }
}

export default authMiddleware;