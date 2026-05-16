// pages/LoginPage.jsx
import '../index.css'
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Link } from "react-router-dom";
import { useState } from "react";

export default function LoginPage() {
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const { login } = useAuth();
  const navigate  = useNavigate();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function handleChange(e) {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
    setError("");
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (!formData.email || !formData.password) {
      return setError("Please fill all fields");
    }

    setLoading(true);

    try {
      const response = await fetch("http://localhost:5000/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        // Priority 1 (frontend side): `credentials: 'include'` is the key change.
        //
        // By default, fetch() does NOT send or receive cookies for cross-origin
        // requests (your React app on :5173 talking to your server on :5000).
        //
        // `credentials: 'include'` tells the browser:
        //   "Yes, please send any existing cookies WITH this request, AND
        //    save any Set-Cookie headers that come back."
        //
        // Without this line, the HTTP-only cookie the server sets would be
        // silently ignored by the browser and login would never work.
        credentials: 'include',
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Something went wrong");
        setLoading(false);
        return;
      }

      // Priority 1: NO MORE localStorage.setItem("token", ...)
      //
      // The token now lives in an HTTP-only cookie managed by the browser.
      // We never see it, we never touch it — the browser sends it automatically
      // with every future request to the server.
      //
      // The server returns user info (name, email) in the response body so we
      // can display it in the UI without needing to touch the token at all.
      login(data.user);
      navigate("/dashboard");

      // TODO: store data.user in context/state and redirect to dashboard

      setLoading(false);

    } catch (err) {
      console.error(err);
      setError("Server error");
      setLoading(false);
    }
  }

  return (
    <div className="auth-container">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1 className="logo">TradeInstinct</h1>
        <h2>Welcome back</h2>

        {error && <div className="error-box">{error}</div>}

        <div className="input-wrapper">
          <input
            type="email"
            placeholder="Email"
            name="email"
            value={formData.email}
            onChange={handleChange}
          />
        </div>

        <div className="input-wrapper">
          <input
            type="password"
            placeholder="Password"
            name="password"
            value={formData.password}
            onChange={handleChange}
          />
        </div>

        <button type="submit">
          {loading ? "Logging in..." : "Login"}
        </button>

        <p className="switch-text">
          Don't have an account?
          <Link to="/register"> Register</Link>
        </p>
      </form>
    </div>
  );
}