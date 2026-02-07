import { useCallback, useEffect, useRef, useState } from "react";
import keycloak from "./keycloak";

/* ─── Region Configuration ─────────────────────────────────────────── */
const REGION = "EU";
const REGION_COLOR = "#0d8a56";
const REGION_BG = "#e6f4ed";
const OTHER_REGION = "US";
const OTHER_APP_URL = "http://localhost:3000";
const API_URL = "http://localhost:4001";
/** The OTHER region's API URL — used for cross-region data fetching */
const OTHER_API_URL = "http://localhost:4000";
/** IDP alias registered on the OTHER region's Keycloak that points back to THIS region */
const CROSS_IDP_HINT = "eu-keycloak-idp";

/* ─── Types ────────────────────────────────────────────────────────── */
interface TokenPayload {
  [key: string]: unknown;
}

/* ─── App Component ────────────────────────────────────────────────── */
export default function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const initCalled = useRef(false);

  useEffect(() => {
    if (initCalled.current) return;
    initCalled.current = true;

    keycloak
      .init({
        onLoad: "check-sso",
        silentCheckSsoRedirectUri:
          window.location.origin + "/silent-check-sso.html",
        checkLoginIframe: false,
      })
      .then((auth) => {
        setAuthenticated(auth);
        setInitialized(true);

        // If not yet authenticated, check for an idp_hint query param
        // and auto-redirect to the cross-region IDP (skips login form)
        if (!auth) {
          const idpHint = new URLSearchParams(window.location.search).get("idp_hint");
          if (idpHint) {
            keycloak.login({ idpHint });
          }
        }
      })
      .catch((err) => {
        console.error("Keycloak init error:", err);
        setInitialized(true);
      });
  }, []);

  /**
   * Initiates Keycloak login flow.
   * When loginHint (email) is provided, Keycloak pre-fills the username field
   * so the user only needs to enter their password on the Keycloak challenge screen.
   */
  const handleLogin = useCallback((loginHint?: string) => {
    keycloak.login(loginHint ? { loginHint } : undefined);
  }, []);

  const handleLogout = useCallback(() => {
    keycloak.logout({ redirectUri: window.location.origin });
  }, []);

  if (!initialized) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner} />
        <p style={{ color: "#666", marginTop: 16 }}>
          Connecting to {REGION} Keycloak...
        </p>
      </div>
    );
  }

  return (
    <div style={styles.root}>
      <Navbar
        authenticated={authenticated}
        onLogin={handleLogin}
        onLogout={handleLogout}
      />
      <main style={styles.main}>
        {authenticated ? (
          <>
            <CrossRegionBanner />
            <div style={styles.grid}>
              <UserProfile />
              <ApiDemo />
            </div>
            <CrossRegionApiDemo />
            <TokenDetails />
          </>
        ) : (
          <LandingPage onLogin={handleLogin} />
        )}
      </main>
    </div>
  );
}

/* ─── Navbar ───────────────────────────────────────────────────────── */
function Navbar({
  authenticated,
  onLogin,
  onLogout,
}: {
  authenticated: boolean;
  onLogin: (loginHint?: string) => void;
  onLogout: () => void;
}) {
  return (
    <nav style={styles.navbar}>
      <div style={styles.navLeft}>
        <span style={styles.regionBadge}>{REGION}</span>
        <span style={styles.navTitle}>Cross-Region SSO Demo</span>
      </div>
      <div style={styles.navRight}>
        {authenticated && (
          <span style={styles.username}>
            {keycloak.tokenParsed?.preferred_username || "User"}
          </span>
        )}
        {authenticated ? (
          <button style={styles.btnOutline} onClick={onLogout}>
            Logout
          </button>
        ) : (
          /* Navbar login skips the in-app email step — goes straight to Keycloak */
          <button style={styles.btnPrimary} onClick={() => onLogin()}>
            Login
          </button>
        )}
      </div>
    </nav>
  );
}

/* ─── Landing Page ─────────────────────────────────────────────────── */
/**
 * Landing page with an in-app email form.
 * The entered email is forwarded to Keycloak as `login_hint`, pre-filling the
 * username field on the Keycloak challenge screen so only the password is required.
 */
function LandingPage({ onLogin }: { onLogin: (loginHint?: string) => void }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  /** Validate and submit the email to kick off the Keycloak flow with loginHint */
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();

    // Basic email format validation before redirecting
    if (!trimmed) {
      setError("Please enter your email address.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Please enter a valid email address.");
      return;
    }

    setError("");
    // Pass the email as loginHint — Keycloak will pre-fill it on the login page
    onLogin(trimmed);
  };

  return (
    <div style={styles.landing}>
      <div style={styles.landingCard}>
        {/* Lock icon */}
        <div style={{ fontSize: 48, marginBottom: 8 }}>&#128274;</div>

        <h1 style={{ margin: 0, fontSize: 28, color: "#1a1a1a" }}>
          Welcome to the {REGION} Region App
        </h1>
        <p style={{ color: "#666", fontSize: 16, lineHeight: 1.6 }}>
          Enter your email to continue. You will be prompted for your password
          on the next screen.
        </p>

        {/* ─── Email Input Form ─────────────────────────────────────── */}
        <form onSubmit={handleSubmit} style={styles.emailForm}>
          <label htmlFor="login-email" style={styles.inputLabel}>
            Email Address
          </label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            autoFocus
            placeholder="you@example.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (error) setError(""); // clear error on change
            }}
            style={{
              ...styles.emailInput,
              borderColor: error ? "#dc3545" : "#d0d5dd",
            }}
          />
          {/* Inline validation error */}
          {error && (
            <p style={styles.errorText}>{error}</p>
          )}

          <button
            type="submit"
            style={{
              ...styles.btnPrimary,
              width: "100%",
              fontSize: 16,
              padding: "12px 0",
              marginTop: 4,
            }}
          >
            Continue
          </button>
        </form>

        {/* ─── Divider ──────────────────────────────────────────────── */}
        <div style={styles.divider}>
          <span style={styles.dividerText}>OR</span>
        </div>

        {/* Fallback: skip the email step and go directly to Keycloak */}
        <button
          type="button"
          style={{ ...styles.btnOutline, width: "100%", padding: "10px 0" }}
          onClick={() => onLogin()}
        >
          Login with {REGION} Keycloak directly
        </button>

        <p style={{ color: "#999", fontSize: 13, marginTop: 16 }}>
          Keycloak URL:{" "}
          <code style={styles.code}>http://localhost:8081</code>
          &nbsp;&bull;&nbsp; Realm: <code style={styles.code}>eu-realm</code>
        </p>
      </div>
    </div>
  );
}

/* ─── Cross-Region Banner ──────────────────────────────────────────── */
function CrossRegionBanner() {
  return (
    <div style={styles.crossBanner}>
      <div>
        <strong>Test Cross-Region SSO:</strong> You are authenticated on{" "}
        {REGION} Keycloak. Click the button to visit the {OTHER_REGION} app —
        you will be automatically signed in via identity brokering without
        entering credentials again.
      </div>
      {/* Append idp_hint so the destination app auto-redirects to this region's IDP */}
      <a
        href={`${OTHER_APP_URL}?idp_hint=${CROSS_IDP_HINT}`}
        style={styles.crossBtn}
      >
        Visit {OTHER_REGION} App &rarr;
      </a>
    </div>
  );
}

/* ─── User Profile ─────────────────────────────────────────────────── */
function UserProfile() {
  const token = keycloak.tokenParsed;
  if (!token) return null;

  const idpOrigin = (token as TokenPayload)["identity_provider"] as
    | string
    | undefined;

  const fields = [
    { label: "Username", value: token.preferred_username },
    { label: "Email", value: token.email },
    { label: "Full Name", value: token.name || `${token.given_name ?? ""} ${token.family_name ?? ""}`.trim() },
    { label: "Issuer", value: token.iss },
    { label: "Realm", value: token.iss?.split("/realms/")[1] },
    {
      label: "Auth Source",
      value: idpOrigin ? `Brokered via ${idpOrigin}` : "Direct login",
    },
    { label: "Session ID", value: token.sid },
    {
      label: "Token Expiry",
      value: token.exp
        ? new Date(token.exp * 1000).toLocaleTimeString()
        : "N/A",
    },
  ];

  return (
    <div style={styles.card}>
      <h2 style={styles.cardTitle}>
        <span style={{ marginRight: 8 }}>&#128100;</span> User Profile
      </h2>
      <table style={styles.table}>
        <tbody>
          {fields.map((f) => (
            <tr key={f.label}>
              <td style={styles.tdLabel}>{f.label}</td>
              <td style={styles.tdValue}>{f.value || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── API Demo ─────────────────────────────────────────────────────── */
function ApiDemo() {
  const [userInfoResult, setUserInfoResult] = useState<string>("");
  const [dataResult, setDataResult] = useState<string>("");
  const [loading, setLoading] = useState<{ userinfo: boolean; data: boolean }>({
    userinfo: false,
    data: false,
  });

  const callApi = async (endpoint: string, setter: (v: string) => void, key: "userinfo" | "data") => {
    setLoading((prev) => ({ ...prev, [key]: true }));
    setter("");
    try {
      // Refresh token if it will expire within 30 seconds
      await keycloak.updateToken(30);

      const res = await fetch(`${API_URL}/api/${endpoint}`, {
        headers: {
          Authorization: `Bearer ${keycloak.token}`,
        },
      });
      const json = await res.json();
      setter(JSON.stringify(json, null, 2));
    } catch (err) {
      setter(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  return (
    <div style={styles.card}>
      <h2 style={styles.cardTitle}>
        <span style={{ marginRight: 8 }}>&#128268;</span> Protected API
      </h2>
      <p style={{ color: "#666", fontSize: 14, margin: "0 0 16px" }}>
        Call the {REGION} Express API server at{" "}
        <code style={styles.code}>{API_URL}</code> with your Bearer token.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button
          style={styles.btnPrimary}
          onClick={() => callApi("userinfo", setUserInfoResult, "userinfo")}
          disabled={loading.userinfo}
        >
          {loading.userinfo ? "Loading..." : "GET /api/userinfo"}
        </button>
        <button
          style={styles.btnSecondary}
          onClick={() => callApi("data", setDataResult, "data")}
          disabled={loading.data}
        >
          {loading.data ? "Loading..." : "GET /api/data"}
        </button>
      </div>

      {userInfoResult && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>
            /api/userinfo response:
          </div>
          <pre style={styles.pre}>{userInfoResult}</pre>
        </div>
      )}
      {dataResult && (
        <div>
          <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>
            /api/data response:
          </div>
          <pre style={styles.pre}>{dataResult}</pre>
        </div>
      )}
    </div>
  );
}

/* ─── Cross-Region API Demo ────────────────────────────────────────── */
/**
 * Demonstrates calling the OTHER region's API directly from this app.
 * The same Keycloak-issued Bearer token is sent to the foreign API,
 * which now trusts tokens from both Keycloaks (multi-issuer JWKS).
 */
function CrossRegionApiDemo() {
  const [userInfoResult, setUserInfoResult] = useState<string>("");
  const [dataResult, setDataResult] = useState<string>("");
  const [loading, setLoading] = useState<{
    userinfo: boolean;
    data: boolean;
  }>({ userinfo: false, data: false });

  /** Call the cross-region API with the current user's Bearer token */
  const callCrossApi = async (
    endpoint: string,
    setter: (v: string) => void,
    key: "userinfo" | "data"
  ) => {
    setLoading((prev) => ({ ...prev, [key]: true }));
    setter("");
    try {
      // Refresh token if it will expire within 30 seconds
      await keycloak.updateToken(30);

      const res = await fetch(`${OTHER_API_URL}/api/${endpoint}`, {
        headers: {
          Authorization: `Bearer ${keycloak.token}`,
        },
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        setter(
          JSON.stringify(
            { status: res.status, ...errBody },
            null,
            2
          )
        );
        return;
      }

      const json = await res.json();
      setter(JSON.stringify(json, null, 2));
    } catch (err) {
      setter(
        `Error: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  return (
    <div style={{ ...styles.card, marginTop: 24 }}>
      <h2 style={styles.cardTitle}>
        <span style={{ marginRight: 8 }}>&#127760;</span> Cross-Region API
        <span
          style={{
            marginLeft: 8,
            fontSize: 12,
            fontWeight: 500,
            padding: "2px 8px",
            borderRadius: 4,
            backgroundColor: "#fff3cd",
            color: "#856404",
            border: "1px solid #ffc107",
          }}
        >
          {OTHER_REGION}
        </span>
      </h2>
      <p style={{ color: "#666", fontSize: 14, margin: "0 0 8px" }}>
        Call the <strong>{OTHER_REGION}</strong> Express API server at{" "}
        <code style={styles.code}>{OTHER_API_URL}</code> using your{" "}
        <strong>{REGION}</strong> Keycloak token. The {OTHER_REGION} API
        trusts tokens from both Keycloaks via multi-issuer JWKS validation.
      </p>
      <p
        style={{
          color: "#888",
          fontSize: 12,
          margin: "0 0 16px",
          fontStyle: "italic",
        }}
      >
        This proves your {REGION}-issued token is accepted cross-region
        without a separate login.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button
          style={{
            ...styles.btnPrimary,
            backgroundColor: "#e67e22",
          }}
          onClick={() =>
            callCrossApi("userinfo", setUserInfoResult, "userinfo")
          }
          disabled={loading.userinfo}
        >
          {loading.userinfo
            ? "Loading..."
            : `GET ${OTHER_REGION} /api/userinfo`}
        </button>
        <button
          style={{
            ...styles.btnPrimary,
            backgroundColor: "#8e44ad",
          }}
          onClick={() => callCrossApi("data", setDataResult, "data")}
          disabled={loading.data}
        >
          {loading.data
            ? "Loading..."
            : `GET ${OTHER_REGION} /api/data`}
        </button>
      </div>

      {userInfoResult && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>
            {OTHER_REGION} /api/userinfo response:
          </div>
          <pre style={styles.pre}>{userInfoResult}</pre>
        </div>
      )}
      {dataResult && (
        <div>
          <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>
            {OTHER_REGION} /api/data response:
          </div>
          <pre style={styles.pre}>{dataResult}</pre>
        </div>
      )}
    </div>
  );
}

/* ─── Token Details ────────────────────────────────────────────────── */
function TokenDetails() {
  const [expanded, setExpanded] = useState(false);
  const token = keycloak.tokenParsed;
  if (!token) return null;

  return (
    <div style={styles.card}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          cursor: "pointer",
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <h2 style={{ ...styles.cardTitle, margin: 0 }}>
          <span style={{ marginRight: 8 }}>&#128273;</span> Raw Token
        </h2>
        <span style={{ color: REGION_COLOR, fontSize: 14 }}>
          {expanded ? "Collapse ▲" : "Expand ▼"}
        </span>
      </div>
      {expanded && (
        <pre style={{ ...styles.pre, marginTop: 12, maxHeight: 400 }}>
          {JSON.stringify(token, null, 2)}
        </pre>
      )}
    </div>
  );
}

/* ─── Styles ───────────────────────────────────────────────────────── */
const styles: Record<string, React.CSSProperties> = {
  root: {
    minHeight: "100vh",
    backgroundColor: "#f5f5f5",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    margin: 0,
  },
  loadingContainer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
  },
  spinner: {
    width: 40,
    height: 40,
    border: `4px solid ${REGION_BG}`,
    borderTop: `4px solid ${REGION_COLOR}`,
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
  },
  navbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0 24px",
    height: 60,
    backgroundColor: "#fff",
    borderBottom: `3px solid ${REGION_COLOR}`,
    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
  },
  navLeft: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  navRight: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  regionBadge: {
    backgroundColor: REGION_COLOR,
    color: "#fff",
    padding: "4px 12px",
    borderRadius: 4,
    fontWeight: 700,
    fontSize: 13,
    letterSpacing: 1,
  },
  navTitle: {
    fontWeight: 600,
    fontSize: 16,
    color: "#333",
  },
  username: {
    color: "#555",
    fontSize: 14,
  },
  main: {
    maxWidth: 960,
    margin: "0 auto",
    padding: "24px 16px",
  },
  landing: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    minHeight: "70vh",
  },
  landingCard: {
    background: "#fff",
    borderRadius: 12,
    padding: "48px 40px",
    textAlign: "center" as const,
    boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
    maxWidth: 520,
  },
  crossBanner: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    padding: "16px 20px",
    borderRadius: 8,
    backgroundColor: REGION_BG,
    border: `1px solid ${REGION_COLOR}33`,
    marginBottom: 24,
    flexWrap: "wrap" as const,
  },
  crossBtn: {
    display: "inline-block",
    backgroundColor: REGION_COLOR,
    color: "#fff",
    padding: "10px 20px",
    borderRadius: 6,
    textDecoration: "none",
    fontWeight: 600,
    fontSize: 14,
    whiteSpace: "nowrap" as const,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 24,
    marginBottom: 24,
  },
  card: {
    background: "#fff",
    borderRadius: 10,
    padding: "20px 24px",
    boxShadow: "0 1px 6px rgba(0,0,0,0.06)",
    marginBottom: 0,
  },
  cardTitle: {
    margin: "0 0 16px",
    fontSize: 17,
    fontWeight: 600,
    color: "#1a1a1a",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
    fontSize: 14,
  },
  tdLabel: {
    padding: "8px 12px 8px 0",
    fontWeight: 600,
    color: "#555",
    whiteSpace: "nowrap" as const,
    borderBottom: "1px solid #f0f0f0",
    width: "35%",
  },
  tdValue: {
    padding: "8px 0",
    color: "#333",
    borderBottom: "1px solid #f0f0f0",
    wordBreak: "break-all" as const,
    fontFamily: "monospace",
    fontSize: 13,
  },
  pre: {
    backgroundColor: "#f8f9fa",
    border: "1px solid #e9ecef",
    borderRadius: 6,
    padding: 14,
    overflow: "auto",
    fontSize: 12,
    lineHeight: 1.5,
    maxHeight: 260,
    margin: 0,
  },
  code: {
    backgroundColor: "#f0f0f0",
    padding: "2px 6px",
    borderRadius: 3,
    fontSize: 13,
    fontFamily: "monospace",
  },
  btnPrimary: {
    backgroundColor: REGION_COLOR,
    color: "#fff",
    border: "none",
    padding: "8px 20px",
    borderRadius: 6,
    fontWeight: 600,
    fontSize: 14,
    cursor: "pointer",
  },
  btnSecondary: {
    backgroundColor: "#6c757d",
    color: "#fff",
    border: "none",
    padding: "8px 20px",
    borderRadius: 6,
    fontWeight: 600,
    fontSize: 14,
    cursor: "pointer",
  },
  btnOutline: {
    backgroundColor: "transparent",
    color: REGION_COLOR,
    border: `1px solid ${REGION_COLOR}`,
    padding: "7px 20px",
    borderRadius: 6,
    fontWeight: 600,
    fontSize: 14,
    cursor: "pointer",
  },
  /* ─── Email Login Form Styles ─────────────────────────────────────── */
  emailForm: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 8,
    textAlign: "left" as const,
    marginTop: 8,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: 600,
    color: "#344054",
    marginBottom: 2,
  },
  emailInput: {
    width: "100%",
    padding: "10px 14px",
    fontSize: 15,
    border: "1px solid #d0d5dd",
    borderRadius: 8,
    outline: "none",
    boxSizing: "border-box" as const,
    transition: "border-color 0.15s ease",
  },
  errorText: {
    color: "#dc3545",
    fontSize: 13,
    margin: "2px 0 0",
  },
  divider: {
    display: "flex",
    alignItems: "center",
    margin: "20px 0",
  },
  dividerText: {
    flex: 1,
    textAlign: "center" as const,
    fontSize: 13,
    color: "#999",
    position: "relative" as const,
    /* Horizontal lines created via border-top on pseudo-like wrapper */
    borderTop: "1px solid #e0e0e0",
    lineHeight: "0",
    padding: "0 12px",
    background: "#fff",
  },
};

