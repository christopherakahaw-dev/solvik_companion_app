import { useState } from "react";
import { Icon, Button } from "../design-system";
import { SolvikBrand } from "../components/SolvikBrand";

export function AuthScreen({ v }) {
  const [mode, setMode] = useState("login"); // "login" | "register"
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError("");
    if (!username.trim() || !password) {
      setLocalError("Please enter both username and password.");
      return;
    }
    if (mode === "register" && username.trim().length < 3) {
      setLocalError("Username must be at least 3 characters.");
      return;
    }
    if (mode === "register" && password.length < 6) {
      setLocalError("Password must be at least 6 characters.");
      return;
    }

    try {
      if (mode === "login") {
        await v.authLogin(username.trim(), password);
      } else {
        await v.authRegister(username.trim(), password);
      }
    } catch (err) {
      setLocalError(err.message || "Authentication failed. Please try again.");
    }
  };

  const errorMessage = localError || v.authError;

  return (
    <main className="sv-auth-screen">
      <div className="sv-auth-card">
      <div className="sv-auth-topbar">
        <SolvikBrand />
        <span className="sv-auth-private">
          <Icon name="shield-check" size={14} />
          Private & Secure
        </span>
      </div>

      <div className="sv-auth-copy">
          <h1>
            {mode === "login" ? "Welcome back" : "Create account"}
          </h1>
          <p>
            {mode === "login"
              ? "Sign in to access your saved places, persona, and commute preferences."
              : "Register to save your commute habits and preferences across sessions."}
          </p>
      </div>

        <div className="sv-auth-tabs" role="tablist" aria-label="Account options">
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setLocalError("");
            }}
            aria-selected={mode === "login"}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("register");
              setLocalError("");
            }}
            aria-selected={mode === "register"}
          >
            Register
          </button>
        </div>

        {errorMessage && (
          <div className="sv-auth-notice sv-auth-notice-error" role="alert">
            <Icon name="alert-circle" size={16} />
            <span>{errorMessage}</span>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="sv-auth-form"
        >
          <div className="sv-auth-field">
            <label htmlFor="auth-username">Username</label>
            <div className="sv-auth-input-wrap">
              <input
                id="auth-username"
                type="text"
                autoCapitalize="none"
                autoCorrect="off"
                placeholder="e.g. commuter_rachel"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
          </div>

          <div className="sv-auth-field">
            <label htmlFor="auth-password">Password</label>
            <div className="sv-auth-input-wrap">
              <input
                id="auth-password"
                type="password"
                placeholder={mode === "register" ? "At least 6 characters" : "Enter password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <Button
            type="submit"
            variant="primary"
            disabled={v.authBusy}
            fullWidth
          >
            {v.authBusy
              ? "Please wait…"
              : mode === "login"
              ? "Sign In"
              : "Create Account"}
          </Button>
        </form>

        <div className="sv-auth-guest">
          <span>or</span>

        {/* Continue as Guest Button */}
        <Button
          type="button"
          variant="secondary"
          onClick={v.authContinueAsGuest}
          fullWidth
        >
          <Icon name="compass" size={17} />
          <span>Continue as Guest</span>
        </Button>
        <p>
          Guest mode keeps all data on your device without an account.
        </p>
        </div>
      </div>

      <footer className="sv-auth-footer">
        LTA Smart Mobility Hackathon · Smart Commuter Companion
      </footer>
    </main>
  );
}
