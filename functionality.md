# MetaRuntime — Project Specification

## What This Project Is

MetaRuntime is a **metadata-driven application runtime**. It takes a JSON configuration file as input and converts it into a fully working application — complete with a user interface, backend APIs, a database structure, and automated workflows — without any additional code being written for that application.

The person using the platform does not write React components, does not define Express routes, and does not create database tables manually. They write JSON. The platform reads that JSON and builds everything automatically at runtime.

---

## The Core Problem It Solves

Traditional application development requires a developer to manually build each layer of the stack — the UI, the API, the database schema, and any automation logic — every time a new application is needed. This takes time and produces code that is largely repetitive across projects.

MetaRuntime solves this by making the application itself a configuration artifact. The shape of the data, the pages to display, the APIs to expose, and the workflows to run are all described in a single JSON document. The platform interprets that document and generates a working system around it.

---

## What the JSON Configuration Controls

A single JSON config file drives the entire application. It defines four things:

**1. Entities (Database Structure)**
Entities describe the data models. Each entity becomes a database table. Each field in an entity becomes a column in that table with the appropriate data type. Relationships between entities are also declared here.

Example: an entity called `Customer` with fields `name`, `email`, `status` results in a `Customer` table being created in PostgreSQL automatically when the config is registered.

**2. Pages (Frontend UI)**
Pages describe what the user sees. Each page contains one or more components — a data table, a form, a stat card, a chart, or a detail view. The platform reads the page definition and renders the correct React components, wired to the correct API endpoints, without any manual frontend code.

Example: a page called `Customers` with a `table` component for the `Customer` entity results in a rendered, paginated, filterable data table appearing in the app sidebar — populated with live data.

**3. APIs (Backend Routes)**
The platform generates REST API endpoints for every entity defined in the config. A `GET`, `POST`, `PUT`, and `DELETE` endpoint is created automatically. These endpoints handle validation, error responses, and database operations. No route files are written manually for these.

Example: an entity called `Deal` results in the following endpoints being available with no additional code:
- `GET /api/runtime/:appSlug/deal`
- `POST /api/runtime/:appSlug/deal`
- `PUT /api/runtime/:appSlug/deal/:id`
- `DELETE /api/runtime/:appSlug/deal/:id`

**4. Workflows (Automation)**
Workflows define automated actions that run when something happens in the system. A workflow has a trigger (such as a record being created or updated), an optional condition, and a list of actions to execute (such as sending a notification, calling a webhook, or writing to another table).

Example: a workflow triggered `on_create` of a `Customer` entity that sends a notification saying "New customer added" will run automatically every time a customer is created — with no manual wiring required.

---

## What the Platform Generates Automatically

| Input (JSON Config) | Generated Output |
|---|---|
| Entity definition | PostgreSQL table created via raw SQL |
| Entity fields | Typed columns with correct data types |
| Page with table component | Rendered data table wired to live API |
| Page with form component | Rendered form with field validation |
| Page with stat-card component | Live count card populated from API |
| Entity definition | Full CRUD REST API endpoints |
| Workflow definition | Automated trigger → action execution |
| Auth config | Role-based access applied to routes |

---

## How It Handles Bad Configuration

The JSON configuration provided to the system may be incomplete, incorrect, or inconsistent. The platform is built to handle this gracefully. It never crashes because of a bad config. Instead it applies the following strategy:

**Missing fields** are filled in with safe defaults. If a page definition is missing a `roles` field, it defaults to allowing all roles. If an entity is missing a `timestamps` field, it defaults to true. The application continues to function.

**Invalid values** are corrected at parse time. If a field type is set to an unrecognised value such as `"uuid"`, the validator replaces it with `"string"` and logs a warning. The field still appears in the entity — it just uses a safe fallback type.

**Unknown components** are rendered as placeholders. If a page references a component type that does not exist in the component registry, the platform renders a visible placeholder saying "Unknown component type: [name]" rather than throwing an error and breaking the page.

**Inconsistent schemas** are partially accepted. Fields that can be parsed are kept. Fields that cannot be understood are skipped. A list of warnings is returned alongside the parsed config so the developer can see exactly what was repaired or ignored. The application remains operational.

This means a partially broken config results in a partially working application — not a crash. The platform is designed to be resilient by default.

---

## System Architecture Summary

The platform is split into two applications that work together:

**Backend (`apps/api`) — Node.js + Express + TypeScript**
- Config engine: parses and validates the JSON config, applies repairs, returns warnings
- API factory: generates Express route handlers for each entity at runtime
- Database runtime: creates PostgreSQL tables dynamically from entity definitions
- Workflow engine: listens for triggers and executes action chains
- Auth: JWT-based authentication with role-based access control
- Notifications: async notification delivery via a Bull queue backed by Redis

**Frontend (`apps/web`) — Next.js + React + TypeScript + TailwindCSS**
- Config parser: reads the validated config and makes it usable on the client
- Component registry: maps component type strings to React components
- Page renderer: reads page definitions and renders the correct components with live data
- API client: typed functions that call the backend for all data operations
- Notification bell: real-time unread count with dropdown list

**Database — PostgreSQL + Prisma**
- Static schema: User, App, Notification models managed by Prisma migrations
- Dynamic schema: entity tables created at runtime using raw SQL when a config is registered

---

## Boundaries of the System

This platform generates applications — it does not replace them. The generated application is real and functional: the database tables contain real data, the API endpoints follow REST conventions, and the UI components are rendered React. It is not a preview or a mockup.

However the platform does not generate arbitrary code. It generates applications that fit the shape described by the config schema. Custom business logic beyond what the workflow engine supports requires extending the platform itself, not the config.

---

## Example: What a Complete Config Produces

Given this JSON:

```json
{
  "name": "Simple CRM",
  "entities": [
    {
      "name": "Customer",
      "fields": [
        { "name": "name", "type": "string", "required": true },
        { "name": "email", "type": "email", "required": true, "unique": true },
        { "name": "status", "type": "string", "defaultValue": "active" }
      ]
    }
  ],
  "pages": [
    {
      "name": "Customers",
      "slug": "customers",
      "components": [
        { "type": "table", "entity": "Customer" },
        { "type": "form", "entity": "Customer" }
      ]
    }
  ],
  "workflows": [
    {
      "name": "Notify on new customer",
      "trigger": "on_create",
      "entity": "Customer",
      "actions": [
        {
          "type": "send_notification",
          "config": {
            "title": "New Customer",
            "message": "A new customer was added to the system"
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

The platform produces:

- A `Customer` table in PostgreSQL with columns `id`, `name`, `email`, `status`, `createdAt`, `updatedAt`
- REST endpoints: `GET`, `POST`, `PUT`, `DELETE` at `/api/runtime/simple-crm/customer`
- A rendered page in the app sidebar called "Customers" containing a live data table and a create form
- An automated workflow that creates a notification in the database every time a customer is created
- All of this protected by JWT authentication

No additional code is written. The config is the application.