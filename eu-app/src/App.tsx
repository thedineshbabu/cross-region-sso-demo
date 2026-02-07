import { useCallback, useEffect, useRef, useState } from "react";
import keycloak from "./keycloak";

/* ─── Region Configuration ─────────────────────────────────────────── */
const REGION = "EU";
const OTHER_REGION = "US";
const OTHER_APP_URL = "http://localhost:3000";
const API_URL = "http://localhost:4001";
/** The OTHER region's API URL — used for cross-region data fetching */
const OTHER_API_URL = "http://localhost:4000";
/** IDP alias registered on the OTHER region's Keycloak that points back to THIS region */
const CROSS_IDP_HINT = "eu-keycloak-idp";

/* ─── Korn Ferry Design Tokens (EU — Blue variant) ──────────────────
 * EU region uses a blue accent palette to visually distinguish it
 * from the green/teal US region while keeping the same KF layout.
 */
const KF_BLUE = "#2563eb";         // "TALENT" brand blue (replaces green for EU)
const KF_NAVY = "#1B365D";         // "SUITE" brand navy (shared with US)
const KF_PRIMARY = "#1d4ed8";      // Primary action blue (replaces teal for EU)
const KF_PRIMARY_LIGHT = "#eff6ff"; // Light blue background for info banners
const KF_GRAY_100 = "#f7f8fa";     // Page background
const KF_GRAY_200 = "#e9ecef";     // Table borders, dividers
const KF_GRAY_300 = "#d1d5db";     // Input borders
const KF_GRAY_500 = "#6b7280";     // Muted text
const KF_GRAY_700 = "#374151";     // Body text
const KF_GRAY_900 = "#111827";     // Headings

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

  /* ── Loading state while Keycloak initializes ── */
  if (!initialized) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner} />
        <p style={{ color: KF_GRAY_500, marginTop: 16, fontFamily: kfFont }}>
          Connecting to {REGION} Region...
        </p>
      </div>
    );
  }

  return (
    <div style={styles.root}>
      {/* Authenticated view shows the full dashboard; otherwise the KF-branded login */}
      {authenticated ? (
        <>
          <Navbar onLogout={handleLogout} />
          <main style={styles.main}>
            <SyncBanner />
            <CrossRegionBanner />
            <div style={styles.grid}>
              <UserProfile />
              <ApiDemo />
            </div>
            <CrossRegionApiDemo />
            <TokenDetails />
          </main>
        </>
      ) : (
        <LandingPage onLogin={handleLogin} />
      )}
    </div>
  );
}

/* ─── Font stack matching Korn Ferry's brand typography ─────────────── */
const kfFont =
  '"Helvetica Neue", Helvetica, Arial, "Segoe UI", Roboto, sans-serif';

/* ═══════════════════════════════════════════════════════════════════════
 * NAVBAR — Korn Ferry Talent Suite top bar (authenticated view)
 * Matches screenshot 2: white bar, navy text "KORN FERRY TALENT SUITE",
 * region badge, user avatar/initials, and logout.
 * ═══════════════════════════════════════════════════════════════════════ */
function Navbar({ onLogout }: { onLogout: () => void }) {
  const username = keycloak.tokenParsed?.preferred_username || "User";
  const initials = username.slice(0, 2).toUpperCase();

  return (
    <nav style={styles.navbar}>
      {/* ── Left: branding ── */}
      <div style={styles.navLeft}>
        <span style={styles.brandKornFerry}>KORN FERRY</span>
        <span style={styles.brandTalent}>TALENT</span>
        <span style={styles.brandSuite}>SUITE</span>
        {/* Region indicator chip */}
        <span style={styles.regionChip}>{REGION} Region</span>
      </div>

      {/* ── Right: user + logout ── */}
      <div style={styles.navRight}>
        <span style={styles.helpIcon} title="Help">?</span>
        <div
          style={styles.avatar}
          title={username}
          onClick={onLogout}
          role="button"
          aria-label="Logout"
        >
          {initials}
        </div>
      </div>
    </nav>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
 * LANDING PAGE — Korn Ferry Talent Suite login screen
 * Matches screenshot 1: gradient background, centered card with
 * "KORN FERRY" / "TALENT SUITE" branding, email input, Sign In button.
 * ═══════════════════════════════════════════════════════════════════════ */
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
    <div style={styles.landingRoot}>
      {/* ── Floating gradient background blobs ── */}
      <div style={styles.gradientBlobTopRight} />
      <div style={styles.gradientBlobBottomLeft} />

      {/* ── Centered login card ── */}
      <div style={styles.landingCard}>
        {/* Korn Ferry branding */}
        <div style={styles.landingBrandRow}>
          <span style={styles.landingKF}>KORN FERRY</span>
        </div>
        <div style={styles.landingTitleRow}>
          <span style={styles.landingTalent}>TALENT</span>
          <br />
          <span style={styles.landingSuite}>SUITE</span>
        </div>

        {/* Region sub-label */}
        <p style={styles.regionSubLabel}>{REGION} Region</p>

        {/* Sign in to your account */}
        <p style={styles.signInLabel}>Sign in to your account</p>

        {/* ─── Email Input Form ─────────────────────────────────────── */}
        <form onSubmit={handleSubmit} style={styles.emailForm}>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            autoFocus
            placeholder="bemorethan@kornferry.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (error) setError(""); // clear error on change
            }}
            style={{
              ...styles.emailInput,
              borderColor: error ? "#dc3545" : KF_GRAY_300,
            }}
          />
          {/* Inline validation error */}
          {error && <p style={styles.errorText}>{error}</p>}

          <button
            type="submit"
            style={styles.signInBtn}
          >
            Sign In
          </button>
        </form>

        {/* ─── Divider ──────────────────────────────────────────────── */}
        <div style={styles.divider}>
          <div style={styles.dividerLine} />
          <span style={styles.dividerText}>OR</span>
          <div style={styles.dividerLine} />
        </div>

        {/* Fallback: skip the email step and go directly to Keycloak */}
        <button
          type="button"
          style={styles.directLoginBtn}
          onClick={() => onLogin()}
        >
          Login with {REGION} Keycloak directly
        </button>

        {/* Footer link */}
        <p style={styles.landingFooter}>
          Keycloak:&nbsp;
          <span style={styles.footerLink}>http://localhost:8081</span>
          &nbsp;&bull;&nbsp;Realm:&nbsp;
          <span style={styles.footerLink}>eu-realm</span>
        </p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
 * SYNC BANNER — Teal info bar (matches the blue info banner in screenshot 2)
 * ═══════════════════════════════════════════════════════════════════════ */
function SyncBanner() {
  const now = new Date().toLocaleString("en-US", {
    month: "long",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });

  return (
    <div style={styles.syncBanner}>
      <span style={styles.syncIcon}>ℹ</span>
      <span>
        Cross-region SSO sessions are automatically synced via identity brokering.
        Last verified: <strong>{now}</strong>.
      </span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
 * CROSS-REGION BANNER — Navigate to the other region's app
 * ═══════════════════════════════════════════════════════════════════════ */
function CrossRegionBanner() {
  return (
    <div style={styles.crossBanner}>
      <div style={{ flex: 1 }}>
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

/* ═══════════════════════════════════════════════════════════════════════
 * USER PROFILE — Styled as a KF-branded table card
 * ═══════════════════════════════════════════════════════════════════════ */
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
        <span style={styles.cardIcon}>👤</span> User Profile
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

/* ═══════════════════════════════════════════════════════════════════════
 * API DEMO — Call the local region's protected API
 * ═══════════════════════════════════════════════════════════════════════ */
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
        <span style={styles.cardIcon}>🔗</span> Protected API
      </h2>
      <p style={styles.cardSubtext}>
        Call the {REGION} Express API server at{" "}
        <code style={styles.code}>{API_URL}</code> with your Bearer token.
      </p>

      <div style={styles.btnRow}>
        <button
          style={styles.btnBlue}
          onClick={() => callApi("userinfo", setUserInfoResult, "userinfo")}
          disabled={loading.userinfo}
        >
          {loading.userinfo ? "Loading..." : "GET /api/userinfo"}
        </button>
        <button
          style={styles.btnNavy}
          onClick={() => callApi("data", setDataResult, "data")}
          disabled={loading.data}
        >
          {loading.data ? "Loading..." : "GET /api/data"}
        </button>
      </div>

      {userInfoResult && (
        <div style={{ marginBottom: 12 }}>
          <div style={styles.preLabel}>/api/userinfo response:</div>
          <pre style={styles.pre}>{userInfoResult}</pre>
        </div>
      )}
      {dataResult && (
        <div>
          <div style={styles.preLabel}>/api/data response:</div>
          <pre style={styles.pre}>{dataResult}</pre>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
 * CROSS-REGION API DEMO — Call the OTHER region's API with local token
 * ═══════════════════════════════════════════════════════════════════════ */
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
        <span style={styles.cardIcon}>🌐</span> Cross-Region API
        <span style={styles.regionTag}>{OTHER_REGION}</span>
      </h2>
      <p style={styles.cardSubtext}>
        Call the <strong>{OTHER_REGION}</strong> Express API server at{" "}
        <code style={styles.code}>{OTHER_API_URL}</code> using your{" "}
        <strong>{REGION}</strong> Keycloak token. The {OTHER_REGION} API
        trusts tokens from both Keycloaks via multi-issuer JWKS validation.
      </p>
      <p style={styles.cardItalic}>
        This proves your {REGION}-issued token is accepted cross-region
        without a separate login.
      </p>

      <div style={styles.btnRow}>
        <button
          style={styles.btnBlue}
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
          style={styles.btnNavy}
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
          <div style={styles.preLabel}>
            {OTHER_REGION} /api/userinfo response:
          </div>
          <pre style={styles.pre}>{userInfoResult}</pre>
        </div>
      )}
      {dataResult && (
        <div>
          <div style={styles.preLabel}>
            {OTHER_REGION} /api/data response:
          </div>
          <pre style={styles.pre}>{dataResult}</pre>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
 * TOKEN DETAILS — Expandable raw JWT viewer
 * ═══════════════════════════════════════════════════════════════════════ */
function TokenDetails() {
  const [expanded, setExpanded] = useState(false);
  const token = keycloak.tokenParsed;
  if (!token) return null;

  return (
    <div style={{ ...styles.card, marginTop: 24 }}>
      <div
        style={styles.expandHeader}
        onClick={() => setExpanded(!expanded)}
      >
        <h2 style={{ ...styles.cardTitle, margin: 0 }}>
          <span style={styles.cardIcon}>🔑</span> Raw Token
        </h2>
        <span style={{ color: KF_PRIMARY, fontSize: 14, cursor: "pointer" }}>
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

/* ═══════════════════════════════════════════════════════════════════════
 * STYLES — Korn Ferry Talent Suite design system
 * All visual tokens derived from the KF brand screenshots provided.
 * ═══════════════════════════════════════════════════════════════════════ */
const styles: Record<string, React.CSSProperties> = {
  /* ── Global ─────────────────────────────────────────────────────── */
  root: {
    minHeight: "100vh",
    backgroundColor: KF_GRAY_100,
    fontFamily: kfFont,
    margin: 0,
    color: KF_GRAY_700,
  },
  loadingContainer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    background: `linear-gradient(135deg, #dbeafe 0%, #f0f5ff 50%, #dbeafe 100%)`,
  },
  spinner: {
    width: 40,
    height: 40,
    border: `4px solid ${KF_PRIMARY_LIGHT}`,
    borderTop: `4px solid ${KF_PRIMARY}`,
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
  },

  /* ── Navbar (authenticated) ─────────────────────────────────────── */
  navbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0 28px",
    height: 56,
    backgroundColor: "#fff",
    borderBottom: `1px solid ${KF_GRAY_200}`,
    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
  },
  navLeft: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  navRight: {
    display: "flex",
    alignItems: "center",
    gap: 16,
  },
  brandKornFerry: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 2.5,
    color: KF_NAVY,
    textTransform: "uppercase" as const,
    marginRight: 4,
  },
  brandTalent: {
    fontSize: 18,
    fontWeight: 700,
    color: KF_BLUE,
    letterSpacing: 1,
  },
  brandSuite: {
    fontSize: 18,
    fontWeight: 700,
    color: KF_NAVY,
    letterSpacing: 1,
  },
  regionChip: {
    marginLeft: 12,
    fontSize: 11,
    fontWeight: 600,
    padding: "3px 10px",
    borderRadius: 12,
    backgroundColor: KF_PRIMARY_LIGHT,
    color: KF_PRIMARY,
    border: `1px solid ${KF_PRIMARY}33`,
  },
  helpIcon: {
    width: 28,
    height: 28,
    borderRadius: "50%",
    border: `1px solid ${KF_GRAY_300}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 14,
    color: KF_GRAY_500,
    cursor: "pointer",
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: "50%",
    backgroundColor: KF_PRIMARY,
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    letterSpacing: 0.5,
  },

  /* ── Main content area ──────────────────────────────────────────── */
  main: {
    maxWidth: 1100,
    margin: "0 auto",
    padding: "24px 24px 48px",
  },

  /* ── Landing page (login) — Korn Ferry gradient background ─────── */
  landingRoot: {
    minHeight: "100vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    position: "relative" as const,
    overflow: "hidden",
    /* Soft blue gradient background for EU region login */
    background: "linear-gradient(160deg, #eef2ff 0%, #f0f5ff 30%, #e0eaff 50%, #eff6ff 70%, #eef2ff 100%)",
  },
  gradientBlobTopRight: {
    position: "absolute" as const,
    top: -60,
    right: -40,
    width: 420,
    height: 420,
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(37,99,235,0.12) 0%, rgba(37,99,235,0.02) 70%)",
    filter: "blur(40px)",
    pointerEvents: "none" as const,
  },
  gradientBlobBottomLeft: {
    position: "absolute" as const,
    bottom: -80,
    left: -60,
    width: 500,
    height: 500,
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(29,78,216,0.10) 0%, rgba(29,78,216,0.01) 70%)",
    filter: "blur(50px)",
    pointerEvents: "none" as const,
  },
  landingCard: {
    position: "relative" as const,
    zIndex: 1,
    background: "#fff",
    borderRadius: 16,
    padding: "48px 44px 36px",
    textAlign: "center" as const,
    boxShadow: "0 4px 24px rgba(0,0,0,0.07)",
    maxWidth: 420,
    width: "100%",
  },
  landingBrandRow: {
    marginBottom: 4,
  },
  landingKF: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 3,
    color: KF_NAVY,
    textTransform: "uppercase" as const,
  },
  landingTitleRow: {
    marginBottom: 20,
    lineHeight: 1.15,
  },
  landingTalent: {
    fontSize: 42,
    fontWeight: 800,
    color: KF_BLUE,
    letterSpacing: 3,
  },
  landingSuite: {
    fontSize: 42,
    fontWeight: 800,
    color: KF_NAVY,
    letterSpacing: 3,
  },
  regionSubLabel: {
    fontSize: 13,
    color: KF_GRAY_500,
    margin: "0 0 24px",
    fontWeight: 500,
  },
  signInLabel: {
    fontSize: 15,
    fontWeight: 600,
    color: KF_GRAY_900,
    margin: "0 0 12px",
    textAlign: "left" as const,
  },

  /* ── Email form (landing) ───────────────────────────────────────── */
  emailForm: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 10,
    textAlign: "left" as const,
  },
  emailInput: {
    width: "100%",
    padding: "11px 14px",
    fontSize: 14,
    border: `1px solid ${KF_GRAY_300}`,
    borderRadius: 6,
    outline: "none",
    boxSizing: "border-box" as const,
    transition: "border-color 0.15s ease",
    color: KF_GRAY_700,
  },
  errorText: {
    color: "#dc3545",
    fontSize: 13,
    margin: "2px 0 0",
  },
  signInBtn: {
    width: "100%",
    padding: "11px 0",
    fontSize: 15,
    fontWeight: 600,
    fontFamily: kfFont,
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    /* Gray Sign In matching screenshot 1 until focused */
    backgroundColor: "#c8ccd0",
    color: "#fff",
    transition: "background-color 0.2s ease",
    marginTop: 2,
  },

  /* ── Divider ────────────────────────────────────────────────────── */
  divider: {
    display: "flex",
    alignItems: "center",
    margin: "20px 0",
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: KF_GRAY_200,
  },
  dividerText: {
    fontSize: 12,
    color: KF_GRAY_500,
    fontWeight: 600,
  },

  /* ── Direct Keycloak login button ───────────────────────────────── */
  directLoginBtn: {
    width: "100%",
    padding: "10px 0",
    fontSize: 14,
    fontWeight: 600,
    fontFamily: kfFont,
    backgroundColor: "transparent",
    color: KF_PRIMARY,
    border: `1px solid ${KF_PRIMARY}`,
    borderRadius: 6,
    cursor: "pointer",
    transition: "background-color 0.15s ease",
  },
  landingFooter: {
    color: KF_GRAY_500,
    fontSize: 12,
    marginTop: 20,
  },
  footerLink: {
    color: KF_PRIMARY,
    textDecoration: "underline",
  },

  /* ── Sync info banner ───────────────────────────────────────────── */
  syncBanner: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    padding: "14px 18px",
    borderRadius: 8,
    backgroundColor: KF_PRIMARY_LIGHT,
    border: `1px solid ${KF_PRIMARY}22`,
    marginBottom: 20,
    fontSize: 13,
    lineHeight: 1.5,
    color: KF_GRAY_700,
  },
  syncIcon: {
    fontSize: 16,
    color: KF_PRIMARY,
    marginTop: 1,
    flexShrink: 0,
  },

  /* ── Cross-region banner ────────────────────────────────────────── */
  crossBanner: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    padding: "16px 20px",
    borderRadius: 8,
    backgroundColor: "#fff",
    border: `1px solid ${KF_GRAY_200}`,
    marginBottom: 24,
    flexWrap: "wrap" as const,
    fontSize: 14,
    lineHeight: 1.6,
  },
  crossBtn: {
    display: "inline-block",
    backgroundColor: KF_PRIMARY,
    color: "#fff",
    padding: "10px 22px",
    borderRadius: 6,
    textDecoration: "none",
    fontWeight: 600,
    fontSize: 14,
    whiteSpace: "nowrap" as const,
    transition: "background-color 0.15s ease",
  },

  /* ── Grid layout ────────────────────────────────────────────────── */
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 24,
    marginBottom: 0,
  },

  /* ── Cards ──────────────────────────────────────────────────────── */
  card: {
    background: "#fff",
    borderRadius: 10,
    padding: "22px 24px",
    boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
    border: `1px solid ${KF_GRAY_200}`,
  },
  cardTitle: {
    margin: "0 0 16px",
    fontSize: 16,
    fontWeight: 700,
    color: KF_GRAY_900,
    display: "flex",
    alignItems: "center",
  },
  cardIcon: {
    marginRight: 8,
    fontSize: 18,
  },
  cardSubtext: {
    color: KF_GRAY_500,
    fontSize: 13,
    margin: "0 0 16px",
    lineHeight: 1.5,
  },
  cardItalic: {
    color: KF_GRAY_500,
    fontSize: 12,
    margin: "0 0 16px",
    fontStyle: "italic",
  },
  regionTag: {
    marginLeft: 8,
    fontSize: 11,
    fontWeight: 600,
    padding: "2px 8px",
    borderRadius: 4,
    backgroundColor: "#fff3cd",
    color: "#856404",
    border: "1px solid #ffc107",
  },

  /* ── Table ──────────────────────────────────────────────────────── */
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
    fontSize: 13,
  },
  tdLabel: {
    padding: "9px 12px 9px 0",
    fontWeight: 600,
    color: KF_GRAY_500,
    whiteSpace: "nowrap" as const,
    borderBottom: `1px solid ${KF_GRAY_200}`,
    width: "35%",
    fontSize: 13,
  },
  tdValue: {
    padding: "9px 0",
    color: KF_GRAY_900,
    borderBottom: `1px solid ${KF_GRAY_200}`,
    wordBreak: "break-all" as const,
    fontFamily: '"SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", monospace',
    fontSize: 12,
  },

  /* ── Pre/code blocks ────────────────────────────────────────────── */
  pre: {
    backgroundColor: KF_GRAY_100,
    border: `1px solid ${KF_GRAY_200}`,
    borderRadius: 6,
    padding: 14,
    overflow: "auto",
    fontSize: 12,
    lineHeight: 1.5,
    maxHeight: 260,
    margin: 0,
    fontFamily: '"SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", monospace',
  },
  preLabel: {
    fontSize: 12,
    color: KF_GRAY_500,
    marginBottom: 4,
    fontWeight: 500,
  },
  code: {
    backgroundColor: KF_GRAY_100,
    padding: "2px 6px",
    borderRadius: 4,
    fontSize: 12,
    fontFamily: '"SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", monospace',
    color: KF_PRIMARY,
  },

  /* ── Buttons ────────────────────────────────────────────────────── */
  btnBlue: {
    backgroundColor: KF_PRIMARY,
    color: "#fff",
    border: "none",
    padding: "9px 20px",
    borderRadius: 6,
    fontWeight: 600,
    fontSize: 13,
    fontFamily: kfFont,
    cursor: "pointer",
    transition: "background-color 0.15s ease",
  },
  btnNavy: {
    backgroundColor: KF_NAVY,
    color: "#fff",
    border: "none",
    padding: "9px 20px",
    borderRadius: 6,
    fontWeight: 600,
    fontSize: 13,
    fontFamily: kfFont,
    cursor: "pointer",
    transition: "background-color 0.15s ease",
  },
  btnRow: {
    display: "flex",
    gap: 8,
    marginBottom: 14,
  },

  /* ── Expand/collapse header ─────────────────────────────────────── */
  expandHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    cursor: "pointer",
  },
};
