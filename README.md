# MetaRuntime

> **A Resilient, Metadata-Driven Application Runtime**

MetaRuntime is a software platform that translates declarative **JSON configurations** into fully functional, database-backed web applications at runtime. The platform automatically sets up PostgreSQL database tables, registers REST CRUD API routes, executes backend workflows, and renders dynamic Next.js dashboards—all without writing or compiling any new code for individual applications.

---

## 💡 The Core Paradigm

Instead of manually building UI forms, boilerplate API endpoints, database schemas, and automation scripts for every new app, you describe them in a single, standard JSON file. MetaRuntime interprets this configuration file on-the-fly:

```
┌─────────────────┐      ┌─────────────────┐      ┌──────────────────────────┐
│   JSON Config   │ ───> │   MetaRuntime   │ ───> │ • PostgreSQL Tables      │
│ (Entities, UI,  │      │  (Core Engine)  │      │ • REST API Endpoints     │
│  Workflows,     │      └─────────────────┘      │ • Dynamic Next.js UI     │
│  Auth, etc.)    │                               │ • Automated Workflows    │
└─────────────────┘                               └──────────────────────────┘
```

---

## 🏗️ Architecture & Component Flow

The project is structured as a TypeScript monorepo consisting of a Node.js Express backend and a Next.js frontend:

```mermaid
graph TD
    subgraph Frontend [Next.js Web - apps/web]
        UI[Dynamic PageRenderer]
        Reg[Component Registry]
        Client[API Client]
    end

    subgraph Backend [Express API - apps/api]
        Val[Config Validator & Parser]
        DBGen[Database Schema Generator]
        APIGen[CRUD Route Factory]
        WF[Workflow Engine]
        Notif[Notification Service]
    end

    subgraph Database [PostgreSQL + Redis]
        PG[(PostgreSQL Schema)]
        RD[(Redis Queue / Bull)]
    end

    %% Flow lines
    Config[JSON Configuration] --> Val
    Val --> DBGen
    Val --> APIGen
    DBGen -->|Creates dynamic tables| PG
    APIGen -->|Mounts routes| UI
    UI -->|Queries data| Client
    Client -->|REST calls| APIGen
    APIGen -->|Triggers events| WF
    WF -->|Schedules/Pushes| Notif
    Notif -->|Bull Worker| RD
    Notif -->|Writes notifications| PG
    Reg -->|Renders Table/Form/Stats| UI
```

### 📂 Repository Structure

*   **`apps/api/`**: TypeScript Express server. Contains the core logic for parsing configurations, building database tables, hosting REST CRUD API builders, evaluating workflows, and handling authentication.
*   **`apps/web/`**: Next.js client application containing the Page Renderer, Component Registry (rendering components like forms, stats, and lists), and authorization state.
*   **Root Folder (`/`)**: Next.js entrypoint that delegates to `apps/web` pages and acts as a local proxy router directing API traffic to the Express server running on port `3001`.

---

## 🛠️ Key Capabilities

| Feature Module | Description & File Pointers |
|---|---|
| **Resilient Config Engine** | Parses, repairs, and sanitizes incoming JSON configurations using **Zod**. Bad syntax or invalid formats return default fallbacks and diagnostic warnings rather than crashing. <br> 📄 See: [apps/api/src/core/config/](file:///c:/Users/HP/OneDrive/Desktop/Presonal%20projects/meta-runtime/apps/api/src/core/config) |
| **On-the-fly Database Generation** | Compiles entity descriptions into PostgreSQL tables using raw SQL queries, supporting columns, constraints, unique keys, and timestamps. <br> 📄 See: [apps/api/src/core/db/schemaGenerator.ts](file:///c:/Users/HP/OneDrive/Desktop/Presonal%20projects/meta-runtime/apps/api/src/core/db/schemaGenerator.ts) |
| **Dynamic REST CRUD API** | Automatically builds and exposes 5 fully validated endpoints for each registered entity (List, Get One, Create, Update, Delete) at `/api/runtime/:appSlug/:entityName`. <br> 📄 See: [apps/api/src/core/api-factory/](file:///c:/Users/HP/OneDrive/Desktop/Presonal%20projects/meta-runtime/apps/api/src/core/api-factory) |
| **Dynamic Frontend Renderer** | Evaluates page definitions and maps configuration strings to React dashboard elements: tables (`DataTable`), input forms (`DynamicForm`), and key metrics (`StatCard`). <br> 📄 See: [apps/web/core/renderer/](file:///c:/Users/HP/OneDrive/Desktop/Presonal%20projects/meta-runtime/apps/web/core/renderer) |
| **Workflow Engine** | Monitors database writes to execute cascading automation events (`on_create`, `on_update`, `on_delete`) including trigger conditions, notification broadcasts, webhooks, database writes, and emails. <br> 📄 See: [apps/api/src/core/workflow/](file:///c:/Users/HP/OneDrive/Desktop/Presonal%20projects/meta-runtime/apps/api/src/core/workflow) |
| **JWT & RBAC Auth** | Secures API endpoints and page-level navigation based on roles configured in the app metadata (e.g. `admin`, `user`). <br> 📄 See: [apps/api/src/middleware/auth.middleware.ts](file:///c:/Users/HP/OneDrive/Desktop/Presonal%20projects/meta-runtime/apps/api/src/middleware/auth.middleware.ts) |
| **Notification Pipeline** | Handles background notifications through a Redis-backed **Bull queue** to prevent blocking transactional database threads. <br> 📄 See: [apps/api/src/features/notifications/](file:///c:/Users/HP/OneDrive/Desktop/Presonal%20projects/meta-runtime/apps/api/src/features/notifications) |

---

## 🛡️ Built-in Configuration Resiliency

MetaRuntime implements a "graceful degradation" policy. A partially invalid configuration yields a partially working application instead of a total system crash:

1.  **Missing Fields**: Zod schema defaults automatically fill in skipped configuration values (e.g., `timestamps` defaults to `true`, `roles` lists default to `["user", "admin"]`).
2.  **Invalid Data Types**: Unrecognized database types (e.g. `uuid`) are coerced to standard fallback types (e.g. `string`) with descriptive console warnings.
3.  **Unknown Components**: Referencing an unregistered component type renders a clean frontend error placeholder rather than halting React lifecycle rendering.
4.  **Database Connection Resiliency**: The Express API continues serving authentication routes when PostgreSQL is unavailable, using the local `.data` stores as a fallback. Set `SKIP_RUNTIME_BOOTSTRAP=1` to skip loading runtime app configuration during local development. Configure `DATABASE_URL` in deployed environments for durable users and application data.

## 🚀 Vercel API Configuration

When deploying the backend with `apps/api` as the Vercel project root, use the Node.js runtime and the included `api/[...path].ts` entry point. The API build runs `prisma generate` before compiling `src` to `dist`.

Configure these server-side environment variables in Vercel:

* `DATABASE_URL` — Neon pooled connection string.
* `DIRECT_URL` — Neon direct connection string used by Prisma migrations and tooling.
* `JWT_SECRET` — secret used to sign authentication tokens.
* `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` — Cloudinary credentials used for persistent profile-picture uploads.
* `FRONTEND_URL` — comma-separated list of allowed frontend origins.

Profile pictures are uploaded from the API to Cloudinary and the returned HTTPS URL is stored in `User.profilePictureUrl`. The Vercel deployment filesystem is not used for uploads.

---

## 📝 Configuration Schema Example

Below is a complete, working configuration file demonstrating database models, frontend dashboards, authentication, and workflow triggers:

```json
{
  "name": "Customer Support Dashboard",
  "entities": [
    {
      "name": "Ticket",
      "fields": [
        { "name": "title", "type": "string", "required": true },
        { "name": "description", "type": "string", "required": false },
        { "name": "status", "type": "string", "defaultValue": "open" },
        { "name": "customerEmail", "type": "email", "required": true }
      ]
    }
  ],
  "pages": [
    {
      "name": "Tickets Portal",
      "slug": "tickets",
      "roles": ["user", "admin"],
      "components": [
        { "type": "stat-card", "entity": "Ticket" },
        { "type": "table", "entity": "Ticket" },
        { "type": "form", "entity": "Ticket" }
      ]
    }
  ],
  "workflows": [
    {
      "name": "Notify Admin on High Priority Tickets",
      "trigger": "on_create",
      "entity": "Ticket",
      "condition": "status == 'urgent'",
      "actions": [
        {
          "type": "send_notification",
          "config": {
            "title": "Urgent Ticket Created",
            "message": "A ticket titled '{{title}}' needs immediate attention."
          }
        }
      ]
    }
  ],
  "auth": {
    "providers": ["credentials"],
    "roles": ["user", "admin"]
  }
}
```

---

## 🚀 Getting Started

### 📋 Prerequisites

*   **Node.js**: v20.x or higher
*   **PostgreSQL**: v13 or higher (required for runtime database table generation)
*   **Redis**: v6.x or higher (required for notification queue runner)

### ⚙️ Installation

1.  Clone the repository and install dependencies at the root directory:
    ```bash
    npm install
    ```
2.  Set up environment variables. Copy the `.env` file in the API folder:
    ```bash
    cp apps/api/.env.example apps/api/.env
    ```
    *Ensure `DATABASE_URL` matches your local PostgreSQL connection string (e.g. `postgresql://postgres:postgres@localhost:5432/metaruntime`).*

3.  Configure your client environment. Create `apps/web/.env.local`:
    ```env
    BACKEND_URL=http://localhost:3001
    ```

### 🏃 Running locally

Start both the backend Express API and the Next.js development client:

```bash
# Runs API server on port 3001 and Next.js frontend proxy on port 3000
npm run dev
```

---

## 🛳️ Build & Deployment

The application features a `nixpacks.toml` file optimized for platforms like **Railway**:

1.  **Build Stage**: Performs a Prisma client cleanup and compiles typescript.
    ```bash
    node ./scripts/prisma-cleanup.js && npm --prefix apps/api run build
    ```
2.  **Start Command**: Runs the precompiled production bundle.
    ```bash
    npm --prefix apps/api run start
    ```

The Nixpacks configuration expects the deployment working directory to be
`apps/api`, so it uses the package-local commands:

```bash
npm run build
npm run start
```

The API's [`apps/api/vercel.json`](./apps/api/vercel.json) uses the same
package-local build command for Vercel. For a repository-root local shell, the
root `prebuild` script remains available and delegates to `apps/api`.
