import { useState } from "react";
import { Icon, Button } from "../design-system";
import { SolvikBrand } from "../components/SolvikBrand";

export function AuthScreen({ v }) {
  const [mode, setMode] = useState("login"); // "login" | "register"
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    setLocalError("");
    if (!username.trim()) {
      setLocalError("Please enter your username.");
      return;
    }
    if (!password) {
      setLocalError("Please enter your password.");
      return;
    }
    if (mode === "register" && password.length < 6) {
      setLocalError("Password must be at least 6 characters.");
      return;
    }

    if (mode === "login") {
      v.authLogin(username.trim(), password);
    } else {
      v.authRegister(username.trim(), password);
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
        padding: "54px 20px 24px",
        overflowY: "auto",
      }}
    >
      <div style={{ flex: "none", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <SolvikBrand />
        <span
          style={{
            font: "var(--type-caption)",
            color: "var(--text-muted)",
            background: "var(--sand-100)",
            padding: "4px 8px",
            borderRadius: "var(--radius-pill)",
          }}
        >
          Secure Account
        </span>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", justifyContent: "center", maxWidth: 440, width: "100%", margin: "0 auto", padding: "20px 0" }}>
        <div style={{ animation: "sv-rise 360ms cubic-bezier(.16,1,.3,1) both", marginBottom: 24, textAlign: "center" }}>
          <div
            style={{
              font: "var(--weight-heavy) 32px/1.15 var(--font-display)",
              letterSpacing: "-.028em",
              color: "var(--text-strong)",
              textWrap: "pretty",
            }}
          >
            {mode === "login" ? "Welcome back" : "Create your account"}
          </div>
          <div
            style={{
              font: "var(--type-body)",
              color: "var(--text-muted)",
              marginTop: 10,
              textWrap: "pretty",
              fontSize: 14,
            }}
          >
            {mode === "login"
              ? "Sign in to restore your preferences and saved routes from our database."
              : "Save your preferences and personalized commute settings to our database."}
          </div>
        </div>

        {/* Tab switcher: Sign in / Create account */}
        <div
          role="tablist"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            background: "var(--sand-200)",
            padding: 4,
            borderRadius: "var(--radius-control)",
            marginBottom: 20,
            gap: 4,
          }}
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "login"}
            onClick={() => {
              setMode("login");
              setLocalError("");
              if (v.authClearError) v.authClearError();
            }}
            style={{
              height: 38,
              border: "none",
              borderRadius: "calc(var(--radius-control) - 2px)",
              font: "var(--weight-bold) 13px/1 var(--font-body)",
              cursor: "pointer",
              transition: "all 0.18s ease",
              background: mode === "login" ? "var(--surface-card)" : "transparent",
              color: mode === "login" ? "var(--text-strong)" : "var(--text-muted)",
              boxShadow: mode === "login" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
            }}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "register"}
            onClick={() => {
              setMode("register");
              setLocalError("");
              if (v.authClearError) v.authClearError();
            }}
            style={{
              height: 38,
              border: "none",
              borderRadius: "calc(var(--radius-control) - 2px)",
              font: "var(--weight-bold) 13px/1 var(--font-body)",
              cursor: "pointer",
              transition: "all 0.18s ease",
              background: mode === "register" ? "var(--surface-card)" : "transparent",
              color: mode === "register" ? "var(--text-strong)" : "var(--text-muted)",
              boxShadow: mode === "register" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
            }}
          >
            Create account
          </button>
        </div>

        {/* Auth form card */}
        <form
          onSubmit={handleSubmit}
          style={{
            background: "var(--surface-card)",
            border: "1px solid var(--border-card)",
            borderRadius: "var(--radius-card)",
            padding: "24px 20px",
            boxShadow: "0 4px 16px rgba(0,0,0,0.04)",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          {errorMessage && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 14px",
                borderRadius: "var(--radius-control)",
                background: "#fef2f2",
                border: "1px solid #fecaca",
                color: "#b91c1c",
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              <Icon name="triangle-alert" size={16} />
              <span style={{ flex: 1 }}>{errorMessage}</span>
            </div>
          )}

          <div>
            <label
              htmlFor="auth-username"
              style={{
                display: "block",
                font: "var(--type-caption)",
                fontWeight: 600,
                color: "var(--text-strong)",
                marginBottom: 6,
              }}
            >
              Username
            </label>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                height: 44,
                padding: "0 12px",
                background: "var(--sand-50)",
                border: "1px solid var(--border-hairline)",
                borderRadius: "var(--radius-control)",
              }}
            >
              <span style={{ color: "var(--text-muted)" }}>
                <Icon name="user" size={17} />
              </span>
              <input
                id="auth-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. rachel_commuter"
                autoCapitalize="none"
                autoCorrect="off"
                disabled={v.authBusy}
                style={{
                  flex: 1,
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  font: "var(--type-body)",
                  color: "var(--text-strong)",
                }}
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="auth-password"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                font: "var(--type-caption)",
                fontWeight: 600,
                color: "var(--text-strong)",
                marginBottom: 6,
              }}
            >
              <span>Password</span>
              {mode === "register" && (
                <span style={{ color: "var(--text-muted)", fontWeight: 400, fontSize: 11 }}>
                  Min. 6 characters
                </span>
              )}
            </label>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                height: 44,
                padding: "0 12px",
                background: "var(--sand-50)",
                border: "1px solid var(--border-hairline)",
                borderRadius: "var(--radius-control)",
              }}
            >
              <span style={{ color: "var(--text-muted)" }}>
                <Icon name="lock" size={17} />
              </span>
              <input
                id="auth-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                disabled={v.authBusy}
                style={{
                  flex: 1,
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  font: "var(--type-body)",
                  color: "var(--text-strong)",
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                aria-label={showPassword ? "Hide password" : "Show password"}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--text-muted)",
                  padding: 4,
                  display: "flex",
                }}
              >
                <Icon name={showPassword ? "eye-off" : "eye"} size={16} />
              </button>
            </div>
          </div>

          <div style={{ marginTop: 6 }}>
            <Button
              type="submit"
              variant="primary"
              size="md"
              fullWidth
              disabled={v.authBusy}
              iconRight={mode === "login" ? "log-in" : "arrow-right"}
            >
              {v.authBusy
                ? "Connecting…"
                : mode === "login"
                  ? "Sign In"
                  : "Create Account & Save Preferences"}
            </Button>
          </div>
        </form>

        {/* Divider */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            margin: "20px 0 16px",
          }}
        >
          <div style={{ flex: 1, height: 1, background: "var(--border-card)" }} />
          <span style={{ font: "var(--type-caption)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 11 }}>
            or continue without account
          </span>
          <div style={{ flex: 1, height: 1, background: "var(--border-card)" }} />
        </div>

        {/* Guest Login Option */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
          <Button
            type="button"
            variant="secondary"
            size="md"
            fullWidth
            onClick={v.authContinueAsGuest}
            disabled={v.authBusy}
            iconLeft="compass"
          >
            Continue as Guest
          </Button>
          <span
            style={{
              font: "var(--type-caption)",
              color: "var(--text-muted)",
              fontSize: 12,
              textAlign: "center",
            }}
          >
            Explore immediately. Preferences stay on this browser only.
          </span>
        </div>
      </div>
    </div>
  );
}
