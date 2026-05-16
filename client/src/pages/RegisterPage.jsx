// pages/RegisterPage.jsx
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Link } from "react-router-dom";
import { useState } from "react";
import '../index.css'

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
  });
  const { login } = useAuth();
  const navigate  = useNavigate();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  function handleChange(e) {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
    setError("");
    setSuccess("");
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (!formData.username || !formData.email || !formData.password) {
      return setError("Please fill all fields");
    }

    if (formData.password.length < 8) {
      return setError("Password must be at least 8 characters");
    }

    setLoading(true);

    try {
      const response = await fetch("http://localhost:5000/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        // Priority 1 (frontend side): Same as LoginPage — REQUIRED for cookies to work.
        // See LoginPage.jsx for the full explanation.
        credentials: 'include',
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Something went wrong");
        setLoading(false);
        return;
      }

      setSuccess("Account created successfully!");

      // Priority 1: NO MORE localStorage.setItem("token", ...)
      // The browser receives the HTTP-only cookie automatically.
      // We just use data.user to display info in the UI.
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
        <h2>Create account</h2>

        {error && <div className="error-box">{error}</div>}
        {success && <div className="success-box">{success}</div>}

        <div className="input-wrapper">
          <input
            type="text"
            placeholder="Username"
            name="username"
            value={formData.username}
            onChange={handleChange}
          />
        </div>

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
          {loading ? "Creating..." : "Create Account"}
        </button>

        <p className="switch-text">
          Already have an account?
          <Link to="/"> Login</Link>
        </p>
      </form>
    </div>
  );
}