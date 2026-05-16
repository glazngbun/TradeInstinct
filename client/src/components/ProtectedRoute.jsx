import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ children }) {
  const { user, isLoading } = useAuth();

  // Auth check in flight — show nothing (or a spinner)
  // This prevents the flash-to-login bug we discussed
  if (isLoading) {
    return <div className="loading-screen">Loading...</div>;
  }

  // Auth check done, no user found → redirect to login
  if (!user) {
    return <Navigate to="/" replace />;
  }

  // Auth check done, user exists → render the protected page
  return children;
}