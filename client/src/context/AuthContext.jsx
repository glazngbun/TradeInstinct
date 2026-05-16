import { createContext, useContext, useState, useEffect } from "react";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [isLoading, setIsLoading] = useState(true); // ← starts TRUE, not false

  useEffect(() => {
    // Runs once when the app first loads.
    // Asks the server "hey, is this browser's cookie still valid?"
    async function checkAuth() {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/auth/me`, {
          credentials: "include", // send the HTTP-only cookie
        });

        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
        } else {
          setUser(null); // cookie expired or doesn't exist
        }
      } catch (err) {
        setUser(null);
      } finally {
        setIsLoading(false); // ← ALWAYS set to false when done, success or fail
      }
    }

    checkAuth();
  }, []);

  // login() is called by LoginPage/RegisterPage after successful response.
  // We pass the user object from the response body (not the token).
  function login(userData) {
    setUser(userData);
  }

  function logout() {
    // Tell the server to clear the cookie
    fetch(`${import.meta.env.VITE_API_URL}/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// Custom hook — components call useAuth() instead of useContext(AuthContext)
// This is cleaner and throws a helpful error if used outside AuthProvider
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}