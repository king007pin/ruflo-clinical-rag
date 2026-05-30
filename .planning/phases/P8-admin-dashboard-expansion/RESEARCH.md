# Research: Admin Dashboard Expansion (P8)

## 🎯 Objective
Plan a state-of-the-art, secure, and centralized **Admin Dashboard** (Mission Control) route at `/admin` that consolidates all system management panels (API keys, swarm monitoring, continuous learning insights, user directory, and invite minting) in a unified, tabbed single-pane-of-glass interface.

---

## 🔍 Technical Foundation & Active API Endpoints

The Mediq application is fully equipped with advanced, self-contained endpoints. The dashboard utilizes these pre-built API handlers to drive operations:

### 1. User & Access Directories (`/api/admin/users`)
* **`GET`**: Returns a list of all registered users (`UserRow[]`), containing columns: `id`, `email`, `role`, `active`, and `createdAt`.
* **`POST`**: Registers a new clinician or viewer account. Generates a strong, cryptographically secure W66-compliant temporary password, hashes it using Argon2id, writes it to the database, and returns the temporary password strictly once.

### 2. Swarm Operations & Health (`/api/admin/manager`)
* **`GET`**: Returns live complexity routing diagnostics and emergency stats:
  * Total query count
  * Number of classified emergencies
  * Average inference latencies (ms)
  * Swarm complexity distribution breakdown (`simple`, `moderate`, `complex`, `emergency`)
  * Cron feed statuses and errors

### 3. Continuous Learning Gaps (`/api/admin/insights`)
* **`GET`**: Returns RAG performance metrics:
  * Total clinical sessions
  * Feedback counts
  * Outstanding knowledge gaps (vector similarity failures)
  * Gaps successfully resolved via PubMed ingestion
* **`PATCH`**: Resolves all open gaps.
* **`DELETE`**: Clears audit session history.

### 4. Background PubMed Ingestion (`/api/cron/learn`)
* **`GET`**: Triggers real-time PubMed API indexing and embedding generation to close existing knowledge gaps.

---

## 🎨 UI Architecture & Tab Layout

The Admin Dashboard (`src/app/admin/page.tsx`) organizes these subsystems inside a responsive, high-fidelity glassmorphic console:

```
┌──────────────────────────────────────────────────────────┐
│  MEDIQ MISSION CONTROL                           [Admin]  │
├──────────────────────────────────────────────────────────┤
│  [Total Accounts: N] [Clinicians: N] [Admins: N]          │
├──────────────────────────────────────────────────────────┤
│  (Tab: Keys)  (Tab: Monitor)  (Tab: Insights)  (Tab: Users)│
├──────────────────────────────────────────────────────────┤
│  Active Tab Content Area                                 │
│                                                          │
│  - Tab 1: ProviderKeyManager (API Keys & 12 Providers)   │
│  - Tab 2: ManagerPanel (Complexity & Emergency Router)    │
│  - Tab 3: InsightsPanel (Knowledge Gaps & PubMed RAG)    │
│  - Tab 4: User Invites (Temporary Credential Generation) │
└──────────────────────────────────────────────────────────┘
```

---

## 🔐 Threat Modeling & Security Guards

1. **Edge Middleware Role Enforcement (`src/middleware.ts`)**:
   - The route `/admin` and all `/api/admin/*` endpoints must be intercepted. Unauthenticated requests are redirected back to the `/login` portal with the origin path preserved in the query string (`?from=/admin`).
2. **Double-Submit CSRF Protection (`src/lib/csrf.ts`)**:
   - All state-changing operations (`POST`, `PATCH`, `DELETE`) on `/api/admin/*` require validating a custom CSRF double-submit token passed in request headers.
3. **Session Binding Guard (`src/lib/auth-guard.ts`)**:
   - Compares the User Agent signature (`uaHash`) of the active session on every incoming admin request to prevent session hijacking via stolen cookies.
