# Cross-Region SSO Demo

A full-stack demonstration of **cross-region Single Sign-On (SSO)** using [Keycloak](https://www.keycloak.org/) identity brokering. Two independent Keycloak instances (US and EU) are configured so that a user authenticated in one region can seamlessly sign in to the other region without re-entering credentials.

---

## Architecture Overview

```
┌──────────────┐       ┌──────────────┐
│  US React App│       │  EU React App│
│  :3000       │       │  :3001       │
└──────┬───────┘       └──────┬───────┘
       │                      │
       ▼                      ▼
┌──────────────┐       ┌──────────────┐
│  US Express  │       │  EU Express  │
│  API  :4000  │       │  API  :4001  │
└──────┬───────┘       └──────┬───────┘
       │                      │
       ▼                      ▼
┌──────────────┐       ┌──────────────┐
│ Keycloak US  │◄─────►│ Keycloak EU  │
│  :8080       │ broker│  :8081       │
└──────────────┘       └──────────────┘
```

| Component        | Technology               | Port  |
| ---------------- | ------------------------ | ----- |
| US Frontend      | React 18 + Vite + TS     | 3000  |
| EU Frontend      | React 18 + Vite + TS     | 3001  |
| US Backend API   | Express 4 + Node 20      | 4000  |
| EU Backend API   | Express 4 + Node 20      | 4001  |
| Keycloak US      | Keycloak 24.0 (Docker)   | 8080  |
| Keycloak EU      | Keycloak 24.0 (Docker)   | 8081  |

---

## Prerequisites

Make sure the following tools are installed on your machine:

- **Docker** & **Docker Compose** (v2+) — [Install Docker](https://docs.docker.com/get-docker/)
- **Node.js** (v18+ recommended, v20 preferred) — [Install Node.js](https://nodejs.org/)
- **npm** (comes with Node.js)

---

## Getting Started

### 1. Clone the Repository

```bash
git clone <repository-url>
cd cross-region-sso-demo
```

### 2. Set Up Environment Variables

Create a `.env` file in the project root with the following values (or the defaults below will be used):

```env
# Keycloak admin credentials
KEYCLOAK_ADMIN=admin
KEYCLOAK_ADMIN_PASSWORD=admin

# Port overrides (optional — defaults shown)
KC_US_PORT=8080
KC_EU_PORT=8081
US_API_PORT=4000
EU_API_PORT=4001
```

### 3. Start the Backend Services (Docker)

This launches both Keycloak instances and both Express API servers:

```bash
docker-compose up -d --build
```

> **Note:** Keycloak can take **30–60 seconds** to fully start. The API containers wait for their respective Keycloak to be healthy before starting.

Verify all four containers are running:

```bash
docker-compose ps
```

You should see `keycloak-us`, `keycloak-eu`, `us-api`, and `eu-api` all in a **running** state.

### 4. Install Frontend Dependencies

Open two separate terminals and install dependencies for each React app:

**Terminal 1 — US App:**

```bash
cd us-app
npm install
```

**Terminal 2 — EU App:**

```bash
cd eu-app
npm install
```

### 5. Start the Frontend Dev Servers

**Terminal 1 — US App:**

```bash
cd us-app
npm run dev
```

**Terminal 2 — EU App:**

```bash
cd eu-app
npm run dev
```

---

## Accessing the Application

Once everything is running, open the following URLs in your browser:

| Service              | URL                                      |
| -------------------- | ---------------------------------------- |
| **US Frontend App**  | [http://localhost:3000](http://localhost:3000) |
| **EU Frontend App**  | [http://localhost:3001](http://localhost:3001) |
| **US API Health**    | [http://localhost:4000/api/health](http://localhost:4000/api/health) |
| **EU API Health**    | [http://localhost:4001/api/health](http://localhost:4001/api/health) |
| **Keycloak US Admin** | [http://localhost:8080/admin](http://localhost:8080/admin) |
| **Keycloak EU Admin** | [http://localhost:8081/admin](http://localhost:8081/admin) |

**Keycloak Admin Console Credentials:**

- **Username:** `admin`
- **Password:** `admin` (or whatever you set in `.env`)

---

## How to Test Cross-Region SSO

1. Open the **US App** at [http://localhost:3000](http://localhost:3000).
2. Click **"Login with US Keycloak"** and sign in with a US realm user.
3. Once authenticated, you will see your user profile, a protected API demo, and a cross-region banner.
4. Click **"Visit EU App →"** in the cross-region banner (opens [http://localhost:3001](http://localhost:3001)).
5. On the EU App, click **"Login"** — you should be authenticated **automatically** via identity brokering without re-entering credentials.

> The same flow works in reverse: log in to the EU App first, then visit the US App.

---

## API Endpoints

Both the US and EU API servers expose the same three endpoints:

| Method | Endpoint          | Auth Required | Description                            |
| ------ | ----------------- | ------------- | -------------------------------------- |
| GET    | `/api/health`     | No            | Returns service status and region info |
| GET    | `/api/userinfo`   | Yes (Bearer)  | Returns decoded user info from the JWT |
| GET    | `/api/data`       | Yes (Bearer)  | Returns region-specific sample data    |

Protected endpoints require a valid Keycloak-issued JWT in the `Authorization: Bearer <token>` header. The frontends handle this automatically.

---

## Project Structure

```
cross-region-sso-demo/
├── docker-compose.yml          # Orchestrates Keycloak + API containers
├── .env                        # Environment variables (create manually)
│
├── keycloak/
│   ├── us-realm.json           # Pre-configured US Keycloak realm export
│   └── eu-realm.json           # Pre-configured EU Keycloak realm export
│
├── us-api/                     # US Region Express API
│   ├── Dockerfile
│   ├── package.json
│   └── server.js               # JWT verification via JWKS, CORS, routes
│
├── eu-api/                     # EU Region Express API
│   ├── Dockerfile
│   ├── package.json
│   └── server.js               # JWT verification via JWKS, CORS, routes
│
├── us-app/                     # US Region React Frontend
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts          # Vite dev server on port 3000
│   ├── tsconfig.json
│   └── src/
│       ├── main.tsx            # React entry point
│       ├── App.tsx             # Main app with auth, profile, API demo
│       └── keycloak.ts         # Keycloak JS adapter config (us-realm)
│
├── eu-app/                     # EU Region React Frontend
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts          # Vite dev server on port 3001
│   ├── tsconfig.json
│   └── src/
│       ├── main.tsx            # React entry point
│       ├── App.tsx             # Main app with auth, profile, API demo
│       └── keycloak.ts         # Keycloak JS adapter config (eu-realm)
│
└── README.md                   # This file
```

---

## Key Technologies

- **Keycloak 24.0** — Open-source Identity and Access Management with identity brokering support
- **React 18** — Frontend UI library
- **Vite 5** — Fast frontend build tool and dev server
- **TypeScript** — Type-safe frontend development
- **Express 4** — Lightweight Node.js API framework
- **jsonwebtoken + jwks-rsa** — Server-side JWT verification via JWKS
- **keycloak-js 24** — Official Keycloak JavaScript adapter for browser-based SSO
- **Docker & Docker Compose** — Containerised Keycloak and API deployment

---

## Stopping the Application

### Stop Docker containers:

```bash
docker-compose down
```

### Stop with volume cleanup (removes Keycloak data):

```bash
docker-compose down -v
```

### Stop the frontend dev servers:

Press `Ctrl + C` in each terminal running the Vite dev servers.

---

## Troubleshooting

| Issue | Solution |
| ----- | -------- |
| Keycloak not starting | Wait 30–60s for full startup. Check logs: `docker-compose logs keycloak-us` |
| API returns 401 Unauthorized | Ensure your Keycloak is healthy and the realm JSON was imported correctly |
| CORS errors in browser | Verify the frontend is running on the expected port (3000/3001) |
| "Cannot connect to Keycloak" in the React app | Confirm Keycloak is accessible at `http://localhost:8080` (US) or `http://localhost:8081` (EU) |
| Port conflicts | Change ports in `.env` and update the corresponding `keycloak.ts` and `App.tsx` hardcoded URLs |
| Docker build fails | Run `docker-compose build --no-cache` to rebuild from scratch |

---

## License

This project is provided as a demonstration / proof-of-concept for educational purposes.

