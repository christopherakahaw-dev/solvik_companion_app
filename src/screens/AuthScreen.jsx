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
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "var(--sand-50)",
        display: "flex",
        flexDirection: "column",
        padding: "48px 20px 24px",
        overflowY: "auto",
      }}
    >
      <div style={{ flex: "none", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <SolvikBrand />
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "4px 9px",
            borderRadius: 999,
            background: "var(--sand-200)",
            color: "var(--text-muted)",
            fontSize: "12px",
            fontWeight: "var(--weight-medium)",
          }}
        >
          <Icon name="shield-check" size={14} />
          Private & Secure
        </span>
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          maxWidth: 420,
          width: "100%",
          margin: "0 auto",
          padding: "24px 0",
        }}
      >
        <div style={{ marginBottom: 24, textAlign: "center" }}>
          <h1
            style={{
              font: "var(--weight-heavy) 32px/1.15 var(--font-display)",
              letterSpacing: "-.025em",
              color: "var(--text-strong)",
              margin: 0,
            }}
          >
            {mode === "login" ? "Welcome back" : "Create account"}
          </h1>
          <p
            style={{
              font: "var(--type-body)",
              color: "var(--text-muted)",
              marginTop: 8,
              textWrap: "pretty",
            }}
          >
            {mode === "login"
              ? "Sign in to access your saved places, persona, and commute preferences."
              : "Register to save your commute habits and preferences across sessions."}
          </p>
        </div>

        {/* Tab switcher: Sign in / Register */}
        <div
          style={{
            display: "flex",
            background: "var(--sand-200)",
            padding: 4,
            borderRadius: "var(--radius-card)",
            marginBottom: 20,
          }}
        >
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setLocalError("");
            }}
            style={{
              flex: 1,
              padding: "8px 0",
              border: "none",
              borderRadius: "calc(var(--radius-card) - 3px)",
              background: mode === "login" ? "var(--surface-card)" : "transparent",
              color: mode === "login" ? "var(--text-strong)" : "var(--text-muted)",
              font: "var(--type-body-strong)",
              cursor: "pointer",
              transition: "all 150ms ease",
              boxShadow: mode === "login" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("register");
              setLocalError("");
            }}
            style={{
              flex: 1,
              padding: "8px 0",
              border: "none",
              borderRadius: "calc(var(--radius-card) - 3px)",
              background: mode === "register" ? "var(--surface-card)" : "transparent",
              color: mode === "register" ? "var(--text-strong)" : "var(--text-muted)",
              font: "var(--type-body-strong)",
              cursor: "pointer",
              transition: "all 150ms ease",
              boxShadow: mode === "register" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
            }}
          >
            Register
          </button>
        </div>

        {errorMessage && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 14px",
              borderRadius: "var(--radius-card)",
              background: "#fee2e2",
              border: "1px solid #f87171",
              color: "#991b1b",
              fontSize: "13.5px",
              marginBottom: 16,
            }}
          >
            <Icon name="alert-circle" size={16} />
            <span>{errorMessage}</span>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 14,
            background: "var(--surface-card)",
            padding: "20px 18px",
            borderRadius: "var(--radius-card)",
            border: "1px solid var(--border-card)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
          }}
        >
          <div>
            <label
              htmlFor="auth-username"
              style={{
                display: "block",
                font: "var(--type-body-strong)",
                color: "var(--text-strong)",
                marginBottom: 6,
                fontSize: "13px",
              }}
            >
              Username
            </label>
            <div style={{ position: "relative" }}>
              <input
                id="auth-username"
                type="text"
                autoCapitalize="none"
                autoCorrect="off"
                placeholder="e.g. commuter_rachel"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 12px 10px 36px",
                  borderRadius: "var(--radius-input, 8px)",
                  border: "1px solid var(--border-card)",
                  background: "var(--sand-50)",
                  color: "var(--text-strong)",
                  fontSize: "14px",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
              <span
                style={{
                  position: "absolute",
                  left: 11,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--text-muted)",
                  display: "flex",
                }}
              >
                <Icon name="user" size={16} />
              </span>
            </div>
          </div>

          <div>
            <label
              htmlFor="auth-password"
              style={{
                display: "block",
                font: "var(--type-body-strong)",
                color: "var(--text-strong)",
                marginBottom: 6,
                fontSize: "13px",
              }}
            >
              Password
            </label>
            <div style={{ position: "relative" }}>
              <input
                id="auth-password"
                type="password"
                placeholder={mode === "register" ? "At least 6 characters" : "Enter password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 12px 10px 36px",
                  borderRadius: "var(--radius-input, 8px)",
                  border: "1px solid var(--border-card)",
                  background: "var(--sand-50)",
                  color: "var(--text-strong)",
                  fontSize: "14px",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
              <span
                style={{
                  position: "absolute",
                  left: 11,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--text-muted)",
                  display: "flex",
                }}
              >
                <Icon name="lock" size={16} />
              </span>
            </div>
          </div>

          <Button
            type="submit"
            variant="primary"
            disabled={v.authBusy}
            style={{
              marginTop: 6,
              width: "100%",
              justifyContent: "center",
              padding: "11px 0",
              fontWeight: "var(--weight-bold)",
            }}
          >
            {v.authBusy
              ? "Please wait…"
              : mode === "login"
              ? "Sign In"
              : "Create Account"}
          </Button>
        </form>

        {/* Guest divider */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            margin: "22px 0 16px",
          }}
        >
          <div style={{ flex: 1, height: 1, background: "var(--border-card)" }} />
          <span style={{ fontSize: "12px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".05em" }}>
            or
          </span>
          <div style={{ flex: 1, height: 1, background: "var(--border-card)" }} />
        </div>

        {/* Continue as Guest Button */}
        <Button
          type="button"
          variant="secondary"
          onClick={v.authContinueAsGuest}
          style={{
            width: "100%",
            justifyContent: "center",
            padding: "11px 0",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Icon name="compass" size={17} />
          <span>Continue as Guest</span>
        </Button>
        <p
          style={{
            textAlign: "center",
            fontSize: "11.5px",
            color: "var(--text-muted)",
            marginTop: 8,
          }}
        >
          Guest mode keeps all data on your device without an account.
        </p>
      </div>

      <div
        style={{
          flex: "none",
          textAlign: "center",
          fontSize: "11.5px",
          color: "var(--text-muted)",
          paddingTop: 8,
        }}
      >
        LTA Smart Mobility Hackathon · Smart Commuter Companion
      </div>
    </div>
  );
}
