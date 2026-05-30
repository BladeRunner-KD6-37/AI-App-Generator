# MetaRuntime: Loom Video Script
**Project Explanation - Architecture, Decisions, Edge Cases & Tradeoffs**

---

## SECTION 1: HIGH-LEVEL OVERVIEW (2-3 minutes)

### Intro
"Hi, I'm walking you through MetaRuntime — a metadata-driven application runtime platform. The core idea is simple: you give it a JSON configuration file, and it generates a complete, working application — UI, APIs, database schema, and automated workflows — with zero additional code."

### The Problem It Solves
"In traditional development, every new application requires building the same layers repeatedly: React components, Express routes, database migrations, validation logic. A lot of this is boilerplate. MetaRuntime removes that repetition by treating the application configuration itself as the source of truth."

### What the JSON Controls
"A single JSON file defines four things:

1. **Entities** — your data models. Each entity becomes a PostgreSQL table.
2. **Pages** — what users see. Tables, forms, stat cards, charts — all defined as JSON.
3. **APIs** — REST endpoints generated automatically for every entity.
4. **Workflows** — automation triggered on events: create, update, delete. Actions include sending notifications, calling webhooks, or writing to other tables."

### The Tech Stack
"The platform is split into two apps in a monorepo:
- **Backend** (`apps/api`): Node.js, Express, TypeScript, Prisma ORM, PostgreSQL
- **Frontend** (`apps/web`): Next.js, React, TypeScript, TailwindCSS, React Query

Communication happens via REST API over HTTP. The frontend stores JWT tokens and authenticates requests. The backend validates configs, generates tables and routes dynamically."

---

## SECTION 2: ARCHITECTURE DEEP DIVE (4-5 minutes)

### Backend Architecture (`apps/api`)

#### Layer 1: Config Processing
"The system starts here. When a user creates or updates an app, the JSON config comes in and goes through **three stages**:

1. **Parsing** (`apps/api/src/core/config/parser.ts`): Reads the JSON string, handles invalid JSON gracefully.
2. **Validation** (`apps/api/src/core/config/validator.ts`): Uses Zod schemas to enforce the config structure. Unknown field types fall back to 'string'. Missing required fields get safe defaults.
3. **Warning Generation**: Returns a list of warnings so the user knows what was auto-repaired.

This means a broken config doesn't crash the system — it just gets partially fixed and the user is informed."

#### Layer 2: Dynamic Database Schema Generation
"Once the config is validated, we need to create tables. Here's where it gets interesting:

- The system reads each entity definition and calls `schemaGenerator.ts`
- This generates Prisma-formatted model blocks from the entity definitions
- Field types are mapped: 'string' → String, 'float' → Float, 'boolean' → Boolean, etc.
- Timestamps (createdAt, updatedAt) are auto-added unless explicitly disabled
- Unique constraints and defaults are applied

Then — and this is important — we use **raw SQL** to create the actual tables in PostgreSQL. Why? Because Prisma migrations are designed for known, static schemas. We need to create tables at runtime based on user input. Raw SQL gives us that flexibility."

#### Layer 3: API Route Generation
"Once tables exist, we need endpoints. The `crudFactory.ts` generates five endpoints per entity:

- GET /api/runtime/:slug/:entity — list all records
- GET /api/runtime/:slug/:entity/:id — get one record
- POST /api/runtime/:slug/:entity — create
- PUT /api/runtime/:slug/:entity/:id — update
- DELETE /api/runtime/:slug/:entity/:id — delete

Each endpoint:
- Validates required fields based on the entity definition
- Sanitizes payloads (strips unknown fields)
- Uses `dynamicCreate()`, `dynamicUpdate()`, `dynamicDelete()` to operate on runtime-created tables
- Returns proper HTTP status codes (201 for created, 404 for not found, etc.)"

#### Layer 4: Workflow Execution (Partially Wired)
"Here's where I need to be honest about a gap. The workflow engine is **defined but not fully executed**:

- `executor.ts` has the `executeWorkflowsForEvent()` function
- It's designed to run when records are created, updated, or deleted
- It evaluates conditions and executes actions: send notifications, call webhooks, write to other tables
- **BUT**: These workflows are never actually called in the CRUD handlers

This is a known issue. To fully complete the system, workflows would need to be triggered in the `createHandler`, `updateHandler`, and `deleteHandler` functions. The infrastructure is there — it just needs to be wired up."

#### Layer 5: Authentication & Authorization
"Authentication is JWT-based:

- Users register or login via POST /api/auth/register or /api/auth/login
- Passwords are hashed with bcryptjs (salt 12)
- On success, a JWT is issued with 7-day expiration
- The frontend stores this in localStorage
- Every API request includes the JWT in the Authorization header
- The auth middleware verifies it and attaches the user to the request

Authorization is role-based. Each user has a role (user, admin, etc.), and routes can be restricted by role. This is set up in the auth config."

### Frontend Architecture (`apps/web`)

#### Layer 1: Config Reception & Type Safety
"The frontend receives the validated config from the backend. There's a `parser.ts` that re-parses it to ensure type safety. There are some TypeScript widening issues here that haven't been fully resolved, but the logic works."

#### Layer 2: Component Registry
"The frontend has a **ComponentRegistry** that maps component type strings to actual React components:

- 'table' → DataTable component
- 'form' → DynamicForm component
- 'stat-card' → StatCard component
- 'chart' → placeholder
- 'detail-view' → placeholder

If a page references a component type that doesn't exist, the registry renders an error placeholder instead of crashing. This is important for resilience."

#### Layer 3: Page Renderer
"The PageRenderer takes a page definition from the config and renders the correct components. It:

- Reads the page structure
- For each component, looks up the component type in the registry
- Passes the entity name and config to the component
- Wires components to API endpoints using React Query for data fetching

For tables, the renderer also sets up CRUD operations: users can view, create, edit, and delete records directly from the table UI."

#### Layer 4: API Client
"The frontend uses an `api-client` module that wraps HTTP requests. It:

- Stores the JWT from localStorage
- Includes it in the Authorization header for all requests
- Provides typed functions like `getRuntimeData()`, `createRuntimeRecord()`, etc.
- Uses React Query for caching and state management"

#### Layer 5: Authentication UI
"Login and register pages are simple forms that call the auth endpoints. On success, the JWT is stored. A logout clears it. The auth state is maintained and checked before rendering protected pages."

---

## SECTION 3: KEY ARCHITECTURAL DECISIONS (3-4 minutes)

### Decision 1: Raw SQL for Dynamic Tables
"**Why not just use Prisma?**

Prisma is designed for static schemas. You write migrations, they get applied, and your schema changes are tracked in version control. But MetaRuntime creates tables at runtime based on user configuration.

We could regenerate the Prisma schema file every time, but that's fragile. If the schema file doesn't match the actual database, Prisma's type system breaks.

Instead, we use raw SQL (`$queryRawUnsafe`) to create tables directly. This is more flexible and gives us runtime control. The tradeoff is that we lose some of Prisma's safety guarantees — SQL injection becomes a concern. We mitigate this by **validating and sanitizing entity definitions before generating SQL**."

### Decision 2: Config-as-Code Philosophy
"**Why JSON, not a visual builder?**

We could have built a UI for defining apps. Instead, we chose JSON as the source of truth. Why?

1. **Version control**: JSON configs can be checked into git
2. **Shareability**: Easy to paste and share
3. **Automation**: Configs can be generated programmatically
4. **Simplicity**: One data format instead of UI state serialization

The tradeoff is that users need to understand JSON syntax. We handle this by validating thoroughly and returning helpful error messages."

### Decision 3: Separate Backend and Frontend
"**Why a monorepo with two apps instead of fullstack Next.js?**

1. **Separation of concerns**: Backend generates APIs, frontend renders UIs. Clear responsibility boundary.
2. **Scalability**: Backend can be deployed separately and handle multiple frontend clients
3. **Frontend flexibility**: We could swap the React frontend for a Vue, Angular, or mobile client without changing the backend
4. **Development clarity**: Config processing, database operations, and auth are backend concerns. Rendering is frontend.

The tradeoff is complexity in the deployment and data-passing layers."

### Decision 4: JWT Tokens in localStorage
"**Why localStorage and not httpOnly cookies?**

1. **Control**: The JavaScript can read and manage the token
2. **XSS Vulnerability**: localStorage is vulnerable to XSS attacks, but httpOnly cookies aren't. However, our frontend is self-contained and trusted code
3. **CORS**: If we later add external clients (mobile apps), they can use the same JWT

The tradeoff: localStorage tokens are vulnerable to XSS if the frontend is compromised. Mitigation: strict CSP headers, input sanitization, and no `eval()`."

### Decision 5: React Query for State Management
"**Why React Query and not Redux or Zustand?**

React Query is specifically designed for server state management. It handles:
- Caching API responses
- Automatic refetching when data changes
- Background synchronization
- Optimistic updates

For MetaRuntime, the frontend is mostly displaying data from the backend API. React Query is the right tool because the state lives on the server, not the client.

The tradeoff: We're dependent on React Query's API design. If we needed complex local state, a different solution might be better."

### Decision 6: Graceful Degradation on Bad Config
"**Why accept broken configs instead of rejecting them?**

A strict approach would be: 'If the config is invalid, reject it entirely.' But MetaRuntime takes a different approach:

- Unknown field types default to 'string'
- Missing required fields get safe defaults
- Unknown component types render as placeholders
- Invalid JSON returns the default config with warnings

This means a partially broken config produces a partially working application. Why? Because in real usage, you might have a large config with 20 entities and one typo. Rejecting the entire config is unhelpful.

The tradeoff: The application might behave unexpectedly if the user made mistakes. We mitigate this by returning detailed warnings so the user knows what was fixed."

---

## SECTION 4: EDGE CASES HANDLED (3-4 minutes)

### Edge Case 1: Invalid JSON Configuration
"**Scenario**: User pastes a JSON string with a syntax error.

**What happens**:
1. Parser tries to JSON.parse() the string
2. Catches the error
3. Returns the default config
4. Adds a warning: 'Invalid JSON string'
5. Application loads with the default config (empty entities, pages, workflows)

**Why this matters**: Users might paste incomplete configs from examples. We don't want the system to crash — we handle it gracefully."

### Edge Case 2: Unknown Field Type
"**Scenario**: Entity field has type: 'uuid' but the validator only recognizes 'string', 'float', 'boolean', 'email', 'datetime'.

**What happens**:
1. Zod schema has `.catch('string')` for the field type
2. Invalid types are caught and replaced with 'string'
3. A warning is logged
4. The field still exists, just with a fallback type

**Why this matters**: The system should never reject a field because of a typo. It should repair it and inform the user."

### Edge Case 3: Missing Required Fields
"**Scenario**: Entity definition has no fields array, or page definition has no components.

**What happens**:
1. Validator provides defaults: fields defaults to [], components defaults to []
2. Entity tables are created (possibly empty)
3. Pages render with no components (just shows 'No components defined')
4. Warnings indicate what was filled in

**Why this matters**: Partial configs are common. We build what we can."

### Edge Case 4: Unknown Component Type
"**Scenario**: Page component has type: 'custom-widget', but this isn't in the ComponentRegistry.

**What happens**:
1. ComponentRegistry's fallback is checked
2. If no match, renders an ErrorPlaceholder component
3. Error message says: 'Unknown component type: custom-widget'
4. Page doesn't crash — shows the error in place

**Why this matters**: A page shouldn't break because of a typo in a component name. The error is visible, helping the user fix it, but the rest of the page still renders."

### Edge Case 5: Creating Tables with Reserved SQL Keywords
"**Scenario**: User creates an entity named 'user' or 'table', which are SQL reserved words.

**What happens**:
We use Prisma's naming conventions which apply backticks/quotes to identifiers. The raw SQL we generate also wraps table and column names in quotes to escape them.

Example: `CREATE TABLE "user" (...)` instead of `CREATE TABLE user (...)`

**Why this matters**: Prevents SQL syntax errors and allows users to name entities naturally."

### Edge Case 6: Concurrent App Creation
"**Scenario**: User creates two apps simultaneously.

**What happens**:
Both requests hit the backend. Each:
1. Validates the config
2. Saves the app to the database (or .data/apps.json in dev)
3. Creates the tables
4. Generates the routes

Concurrent requests might race on file system writes (in dev) but succeed on database writes (in prod with Postgres locks).

**Why this matters**: The system should handle concurrent traffic. In production, Postgres handles concurrency. In development (using .data/apps.json), there's a potential race condition we're aware of."

### Edge Case 7: Workflow Execution Missing Data
"**Scenario**: Workflow action references a field that doesn't exist on the entity.

**What happens**:
Currently, workflows aren't fully executed. But if they were and hit this case:
1. The condition evaluation would fail or return undefined
2. The action execution might try to access undefined values
3. Error handling would log the failure and continue

**Mitigation**: Workflow actions should validate that referenced fields exist before executing."

### Edge Case 8: Database Connection Lost During Table Creation
"**Scenario**: Postgres connection drops while creating a table.

**What happens**:
1. Database error is caught by Express error handler
2. Response returns 500 Internal Server Error
3. Partially created tables might remain in the database
4. User sees the error and can retry

**Mitigation**: Transaction support would be ideal (wrap table creation in a transaction), but our schema generation currently doesn't use transactions."

---

## SECTION 5: TRADEOFFS & ARCHITECTURAL TENSIONS (3-4 minutes)

### Tradeoff 1: Flexibility vs. Type Safety
"The system accepts bad configs and tries to repair them. This is flexible — partially broken configs still produce working applications. But it's risky — a typo might silently change behavior instead of causing an error.

We mitigation this with warnings, but a stricter approach would reject invalid configs outright.

**Our choice**: Flexibility. MetaRuntime prioritizes availability over correctness."

### Tradeoff 2: Security vs. Dynamic SQL
"We use raw SQL to create tables at runtime. This is flexible and necessary for a dynamic schema. But raw SQL has SQL injection risks.

We mitigate by:
- Validating entity and field names against a whitelist pattern
- Using prepared statements where possible
- Never directly interpolating user input into SQL

But the risk remains. A stricter approach would only support predefined schema templates.

**Our choice**: Dynamic SQL with validation. We accept the risk for flexibility."

### Tradeoff 3: Consistency vs. Availability
"When workflows execute and fail (sending a notification fails, webhook times out), what do we do?

Option A: Roll back the entire operation (consistency). The record isn't created if workflows fail.
Option B: Create the record anyway (availability). The main operation succeeds; side effects might fail.

We chose B. The notification failure shouldn't prevent a customer record from being created. But this means the system might be in an inconsistent state.

**Our choice**: Availability. The primary operation succeeds even if side effects fail."

### Tradeoff 4: Runtime Type Safety vs. Configuration Control
"Prisma's type system requires knowing the schema at compile time. But our schema is dynamic — defined by user config at runtime.

Option A: Generate Prisma types at build time (TypeScript won't know runtime tables).
Option B: Use any types for runtime operations (loose types).
Option C: Use raw SQL (bypass Prisma entirely for dynamic tables).

We chose C. This means runtime table operations aren't type-safe, but it's the only way to support truly dynamic schemas.

**Our choice**: Runtime flexibility over type safety."

### Tradeoff 5: Frontend Rendering Simplicity vs. Performance
"The frontend downloads the entire config JSON. For large configs (100+ entities, 50+ pages), this payload becomes significant.

Option A: Download the full config (current approach). Simple, all data available immediately.
Option B: Stream components as needed. More complex, but smaller initial download.

For now, we chose A. Most real apps won't have 100+ entities.

**Our choice**: Simplicity over optimization."

### Tradeoff 6: User Model Simplicity vs. Multi-Tenancy
"The current User model is simple: each user has an email, name, password, and role. Apps are associated with users implicitly (created by that user).

For multi-tenancy (multiple organizations, teams), the model would need:
- Organization entities
- User-to-organization mappings
- Organization-level roles

This would significantly complicate auth and data isolation.

**Our choice**: Single-user/single-org for now. Multi-tenancy would require architecture redesign."

### Tradeoff 7: Notification Queue vs. Direct Delivery
"Notifications are queued in Bull (backed by Redis) instead of sent synchronously.

Option A: Send directly in the request handler. Faster response times, but failures block the response.
Option B: Queue asynchronously (current approach). Slower initial response, but failures don't block the user.

**Our choice**: Async queue. More resilient, but adds Redis dependency and complexity."

### Tradeoff 8: Monorepo vs. Separate Repos
"Frontend and backend are in the same monorepo but are independently deployable apps.

Option A: Single repo (current). Shared dependencies, easier to coordinate changes.
Option B: Separate repos. Independent deployments, clearer separation.

**Our choice**: Monorepo with two independent apps. Easier development, but deployment coordination is needed."

---

## SECTION 6: KNOWN ISSUES & GAPS (2-3 minutes)

### Critical Gap: Workflows Not Triggered
"The workflow engine is defined but not called. When a record is created, `executeWorkflowsForEvent()` is never invoked.

**Impact**: Workflows defined in config don't run. Automated actions (notifications, webhooks) don't trigger.

**To fix**: Add calls to `executeWorkflowsForEvent()` in the create/update/delete handlers after the database operation succeeds.

**Why it's not done**: Time constraints and the complexity of passing workflows through the handler chain."

### Issue: Tables Not Created on App Creation
"When a user creates an app via POST /api/config, the entity tables aren't automatically created.

**Current flow**: 
1. App created
2. Tables must be manually initialized via /api/runtime/:entity/init-table

**Expected flow**:
1. App created
2. Tables automatically created

**To fix**: Call the schema generation logic when the app is created, before returning the response."

### Issue: Frontend TypeScript Errors
"Running `npx tsc --noEmit` in apps/web fails with FieldType and ComponentType widening errors in core/config/parser.ts.

**Impact**: Reduces confidence in type safety, makes development harder.

**To fix**: Narrow the types more precisely or restructure the config parsing logic."

### Issue: API Client Completeness
"Some API client functions referenced in the page renderer might not be fully implemented.

**Example**: `deleteRuntimeRecord()` is called but might not handle all error cases.

**To fix**: Complete the API client functions and add error handling."

---

## SECTION 7: DESIGN PHILOSOPHY & WHY (2 minutes)

### "Convention Over Configuration"
"MetaRuntime applies sensible defaults everywhere. No 'timezone' setting? We use UTC. No 'pagination' setting? We default to 10 items per page. No 'roles' field? We default to ['user', 'admin'].

This reduces config complexity. Users only specify what's different from the defaults."

### "Fail Safe, Not Fail Loud"
"When something goes wrong, we try to repair it and continue. A typo in a field type? We fall back to 'string'. Missing components? We show a placeholder.

This prioritizes availability. The application always works, even if parts of the config are broken."

### "Separate Data From Presentation"
"The config defines data structure (entities) separately from how it's displayed (pages, components).

This allows the same data to be rendered in multiple ways — as a table on one page and as a form on another."

### "Authentication First"
"Every API request is protected by JWT authentication. Workflows have access to the user's ID. Authorization checks happen at the route level.

This ensures data isolation and audit trails."

---

## SECTION 8: CLOSING SUMMARY (1 minute)

"MetaRuntime is built around a simple idea: **configuration is application**. The JSON you provide defines your data model, UI, APIs, and automation.

**The architecture achieves this by**:
- Parsing and validating configs at runtime
- Generating PostgreSQL tables from entity definitions
- Auto-creating REST endpoints for CRUD operations
- Rendering React components dynamically based on page definitions
- Running workflows to automate actions

**Key decisions made**:
- Raw SQL for dynamic tables (flexibility over safety)
- Grace degradation on bad config (availability over strictness)
- Async queue for notifications (resilience over speed)
- Separate frontend and backend (clarity over simplicity)

**Known gaps**:
- Workflows aren't triggered yet
- Tables aren't auto-created on app creation
- Frontend TypeScript needs cleanup

**The philosophy**: When something could break, we build a fallback. Bad configs don't crash the system — they get partially fixed. Missing components show placeholders. Unknown field types default to strings.

This makes MetaRuntime resilient, but potentially less strict than traditional systems.

Thanks for walking through this with me. Any questions?"

---

## APPENDIX: Key Files Reference

### Backend (`apps/api`)
- `src/core/config/parser.ts` — parses JSON configs
- `src/core/config/validator.ts` — validates using Zod
- `src/core/db/schemaGenerator.ts` — generates Prisma models from entities
- `src/core/api-factory/crudFactory.ts` — generates CRUD handlers
- `src/core/api-factory/routeBuilder.ts` — registers routes
- `src/core/workflow/executor.ts` — executes workflows (not called yet)
- `src/routes/auth.routes.ts` — authentication endpoints
- `src/middleware/auth.middleware.ts` — JWT verification

### Frontend (`apps/web`)
- `core/config/parser.ts` — re-parses config for type safety
- `core/renderer/ComponentRegistry.tsx` — maps types to components
- `core/renderer/PageRenderer.tsx` — renders page definitions
- `core/api-client/index.ts` — HTTP wrapper for API calls
- `features/notifications/NotificationBell.tsx` — notification UI
- `lib/auth.ts` — auth token management

### Database
- `apps/api/prisma/schema.prisma` — static User, App, Notification models
- Runtime tables created via raw SQL based on config

