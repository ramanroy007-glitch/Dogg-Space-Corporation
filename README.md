# DoggSpace Funnel Engine

Welcome to the **DoggSpace Funnel Engine** — a highly optimized, high-performance CPA/CPL affiliate marketing and digital rewards distribution web application. 

This repository implements a polished single-page squeeze funnel, structured progress page trackers, a dynamic rewards comparison dashboard ("The Masterpiece" `bridge.html`), and an executive administrative control panel complete with a secure server-side AI email copy generator proxy.

---

## 🎨 Creative Architecture & Brand Philosophy

DoggSpace utilizes a custom-designed luxury cosmic dashboard theme:
-   **Color Palette**: Deep space blacks (`#040914`), muted slate elements (`#0B1220`), vibrant gold highlights (`#F5A623`), and terminal-green success states (`#10B981`).
-   **Animations & Motion**: Built-in GSAP (GreenSock) word-by-word headline transitions, CSS-powered opening box sparkles, responsive intersection scroll reveals, and canvas-based confetti celebrations.
-   **Technical Precision**: Eliminates unrequested system metadata, port lists, or margin labels. Features clean, literal labels suitable for end-users.

---

## ⚙️ Core Technical Specifications

### 1. Server & Routing (`server.js`)
Deployed on **Express.js (Node v20+)** with robust native security configurations:
-   **Hardened Headers**: Configured through `helmet` to allow controlled iframe rendering for testing within secure preview zones (such as Google Cloud and AI Studio).
-   **Multiple Rate Limiters**: Independent threshold buckets to ward off brute-force attempts across administrative pathways (`adminLimiter`), spam registrations (`formLimiter`), and static routing (`standardLimiter`).
-   **Double Opt-In Routing**: Integrates a matching transition endpoint (`/api/confirm`) that activates unconfirmed SQL records and redirects parameters cleanly.

### 2. High-Performance SQL Database (SQLite)
Leverages the robust local `sqlite3` relational engine. Initiates a schema containing:
1.  **`subscribers`**: Handles customer profiles mapping names, emails, IPs, DOI verification tags, and comprehensive UTM attribution context parameters (`utm_source`, `utm_campaign`, `utm_medium`).
2.  **`offers`**: Comparison matrices detailing standard MaxBounty CPA offerings, active states, payouts, EPC rankings, category tiers, Unsplash keywords, and visual order indexes.
3.  **`clicks`**: Internal logs tracing tracking pings to monitor conversion rates.
4.  **`settings`**: Key-value data mapping webhooks, domain handles, and metadata.

### 3. Integrated AI Email Copywriter
Designed within the workspace (`admin.html`) to facilitate immediate marketing layout tests:
-   **Real Proxy Execution**: Passes administrative tokens to the backend post `/api/admin/writer/generate` which queries official Anthropic APIs directly under Node variables. This completely circumvents browser-level cross-origin resource sharing (CORS) blocks on the client-side.
-   **Multi-Stage Structuring**: Generates subject headlines, intrigue preheaders, and layout boxes for Cold Squeeze Prospects, OI Reminders, Unlocking welcome packs, and Campaign thresholds.

---

## 📂 Project Directory Structure

```text
├── data/
│   └── doggspace.db          # SQLite Relational Database file (ignored)
├── public/
│   ├── admin.html            # Executive Workspace & AI Copywriter panel
│   ├── bridge.html           # "The Masterpiece" Rewards Comparison Dashboard
│   ├── index.html            # High-conversion Squeeze Landing page
│   ├── og-image.svg          # Visual link vector mockup banner
│   ├── privacy.html          # GDPR/CAN-SPAM Privacy consent parameters
│   ├── terms.html            # FTC Referral disclaimer and regulations code
│   └── thankyou.html         # Progress scanning page with Simulator utilities
├── .dockerignore             # Fast, small container construction bounds
├── .env.example              # Declarative template for system configurations
├── .gitignore                # Filter rules to prevent leaks
├── Dockerfile                # Light Alpine deployment blueprint
├── docker-compose.yml        # Development/Production container mapper
├── package.json              # Operational scripts and package manifests
├── README.md                 # Technical design document (this file)
└── server.js                 # Primary core Express engine execution map
```

---

## 🛠️ Local Development & Deployment Guide

### Prerequisites
- Node.js (v20+) or Docker Engine.

### 1. Simple Local Setup
```bash
# 1. Install operational dependencies
npm install

# 2. Duplicate env configuration
cp .env.example .env

# 3. Spin up the application in developer mode
npm run dev
```

### 2. Standard Container Run (Docker)
```bash
# Build and raise local persistent instance
docker-compose up --build -d
```
The funnel should be active and fully accessible on port **`3000`** (`http://localhost:3000`).

---

## 🔒 Security Standards & Verification Compliance

-   **Environment Protection**: Secret keys remain on the server and are referenced purely through environment calls (`process.env`).
-   **Anti-Spam Verification**: Utilizes regulatory Double Opt-In checks, blocking unconfirmed profiles from catalog items unless verified.
-   **CORS Hardening**: Validates client calls, restricting database modifications to approved domains or local workspace frames.
