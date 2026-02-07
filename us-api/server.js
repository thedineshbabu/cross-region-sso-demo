const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const jwksClient = require("jwks-rsa");

const app = express();

/* ─── Configuration ────────────────────────────────────────────────── */
const PORT = process.env.PORT || 4000;
const KEYCLOAK_URL = process.env.KEYCLOAK_URL || "http://localhost:8080";
const KEYCLOAK_EXTERNAL_URL =
  process.env.KEYCLOAK_EXTERNAL_URL || "http://localhost:8080";
const REALM = process.env.KEYCLOAK_REALM || "us-realm";
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:3000";
const REGION = process.env.REGION || "US";

/* ─── Cross-Region Configuration ──────────────────────────────────── */
/** URL of the OTHER region's Keycloak (Docker-internal) for JWKS fetching */
const CROSS_KEYCLOAK_URL =
  process.env.CROSS_KEYCLOAK_URL || "http://localhost:8081";
/** External/browser-facing URL of the OTHER region's Keycloak (used in token issuer) */
const CROSS_KEYCLOAK_EXTERNAL_URL =
  process.env.CROSS_KEYCLOAK_EXTERNAL_URL || "http://localhost:8081";
/** Realm name on the OTHER region's Keycloak */
const CROSS_REALM = process.env.CROSS_KEYCLOAK_REALM || "eu-realm";
/** The OTHER region's frontend origin — allowed for cross-region API calls */
const CROSS_CORS_ORIGIN =
  process.env.CROSS_CORS_ORIGIN || "http://localhost:3001";

/* ─── JWKS Clients ─────────────────────────────────────────────────── */

/** Local (same-region) JWKS client — validates tokens issued by THIS Keycloak */
const localJwks = jwksClient({
  jwksUri: `${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/certs`,
  cache: true,
  cacheMaxEntries: 5,
  cacheMaxAge: 600000, // 10 minutes
});

/** Cross-region JWKS client — validates tokens issued by the OTHER Keycloak */
const crossJwks = jwksClient({
  jwksUri: `${CROSS_KEYCLOAK_URL}/realms/${CROSS_REALM}/protocol/openid-connect/certs`,
  cache: true,
  cacheMaxEntries: 5,
  cacheMaxAge: 600000, // 10 minutes
});

/**
 * Retrieves the signing key for a JWT.
 * Tries the local JWKS first; if the kid isn't found there, falls back
 * to the cross-region JWKS. This allows the API to accept tokens from
 * both its own Keycloak and the other region's Keycloak.
 */
function getKey(header, callback) {
  localJwks.getSigningKey(header.kid, (err, key) => {
    if (!err && key) {
      return callback(null, key.getPublicKey());
    }
    // kid not found locally — try the cross-region JWKS
    crossJwks.getSigningKey(header.kid, (crossErr, crossKey) => {
      if (crossErr) {
        console.error(
          "Signing key not found in either JWKS endpoint:",
          crossErr.message
        );
        return callback(crossErr);
      }
      callback(null, crossKey.getPublicKey());
    });
  });
}

/* ─── Accepted Issuers ─────────────────────────────────────────────── */
/**
 * We accept tokens from four possible issuer URLs:
 * - Local Keycloak (internal Docker URL)
 * - Local Keycloak (external browser URL)
 * - Cross-region Keycloak (internal Docker URL)
 * - Cross-region Keycloak (external browser URL)
 */
const ACCEPTED_ISSUERS = [
  `${KEYCLOAK_URL}/realms/${REALM}`,
  `${KEYCLOAK_EXTERNAL_URL}/realms/${REALM}`,
  `${CROSS_KEYCLOAK_URL}/realms/${CROSS_REALM}`,
  `${CROSS_KEYCLOAK_EXTERNAL_URL}/realms/${CROSS_REALM}`,
];

/* ─── Middleware ────────────────────────────────────────────────────── */

/** Allow requests from both the local and cross-region frontend origins */
const allowedOrigins = [CORS_ORIGIN, CROSS_CORS_ORIGIN];

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow requests with no origin (server-to-server, curl, etc.)
      if (!origin || allowedOrigins.includes(origin)) {
        return cb(null, true);
      }
      cb(new Error(`CORS: origin ${origin} not allowed`));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type"],
  })
);

app.use(express.json());

/* ─── Auth Middleware ──────────────────────────────────────────────── */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res
      .status(401)
      .json({ error: "Missing or invalid Authorization header" });
  }

  const token = authHeader.split(" ")[1];

  jwt.verify(
    token,
    getKey,
    {
      algorithms: ["RS256"],
      // Accept tokens from both the local and cross-region Keycloak
      issuer: ACCEPTED_ISSUERS,
    },
    (err, decoded) => {
      if (err) {
        console.error("Token verification failed:", err.message);
        return res
          .status(401)
          .json({ error: "Invalid token", detail: err.message });
      }
      req.user = decoded;
      next();
    }
  );
}

/* ─── Routes ───────────────────────────────────────────────────────── */

// Health check (no auth required)
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    region: REGION,
    keycloak: KEYCLOAK_EXTERNAL_URL,
    realm: REALM,
    timestamp: new Date().toISOString(),
  });
});

// Protected: return user info from token
app.get("/api/userinfo", authenticate, (req, res) => {
  const user = req.user;
  res.json({
    region: REGION,
    username: user.preferred_username,
    email: user.email,
    name:
      user.name ||
      `${user.given_name || ""} ${user.family_name || ""}`.trim(),
    issuer: user.iss,
    realm: user.iss?.split("/realms/")[1],
    subject: user.sub,
    sessionId: user.sid,
    clientId: user.azp,
    scope: user.scope,
    roles: user.realm_access?.roles || [],
    tokenIssuedAt: user.iat
      ? new Date(user.iat * 1000).toISOString()
      : null,
    tokenExpiresAt: user.exp
      ? new Date(user.exp * 1000).toISOString()
      : null,
  });
});

// Protected: return region-specific sample data
app.get("/api/data", authenticate, (req, res) => {
  res.json({
    region: REGION,
    message: `Hello from the ${REGION} API server!`,
    requestedBy: req.user.preferred_username,
    data: [
      {
        id: 1,
        name: "US East Data Center",
        status: "operational",
        latency: "12ms",
      },
      {
        id: 2,
        name: "US West Data Center",
        status: "operational",
        latency: "8ms",
      },
      {
        id: 3,
        name: "US Central Data Center",
        status: "maintenance",
        latency: "15ms",
      },
    ],
    timestamp: new Date().toISOString(),
  });
});

/* ─── Start Server ─────────────────────────────────────────────────── */
app.listen(PORT, "0.0.0.0", () => {
  console.log(`[${REGION} API] Server running on port ${PORT}`);
  console.log(
    `[${REGION} API] Keycloak: ${KEYCLOAK_EXTERNAL_URL}/realms/${REALM}`
  );
  console.log(
    `[${REGION} API] Cross-region Keycloak: ${CROSS_KEYCLOAK_EXTERNAL_URL}/realms/${CROSS_REALM}`
  );
  console.log(`[${REGION} API] CORS origins: ${allowedOrigins.join(", ")}`);
});
