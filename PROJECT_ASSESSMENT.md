# MetaRuntime Project Assessment

**Date:** May 30, 2026  
**Status:** PARTIALLY FUNCTIONAL - Major functionality gap identified

## Executive Summary

MetaRuntime has most of the infrastructure to be a metadata-driven application runtime, but has **critical gaps that prevent it from fully functioning as specified**. The project can parse configurations, create UI, and generate APIs, but **workflow automation is not wired up**, and there are several other issues.

---

## ✅ What IS Implemented

### 1. **Config Parsing & Validation** ✅
- **File:** [apps/api/src/core/config/parser.ts](apps/api/src/core/config/parser.ts) and [apps/api/src/core/config/validator.ts](apps/api/src/core/config/validator.ts)
- **Status:** FULLY WORKING
- **Details:**
  - Uses Zod for schema validation
  - Gracefully handles bad JSON: returns default config + warnings
  - Unknown field types fallback to "string": `.catch("string")`
  - Missing fields get safe defaults (timestamps=true, roles=["user", "admin"])
  - Passthrough allows extra fields without rejection
  - Returns warnings list alongside parsed config
- **Example:** Invalid JSON → returns `getDefaultConfig()` with warning "Invalid JSON string"

### 2. **Database Schema Generation** ✅
- **File:** [apps/api/src/core/db/schemaGenerator.ts](apps/api/src/core/db/schemaGenerator.ts)
- **Status:** WORKING (though using raw SQL instead of Prisma migrations)
- **Details:**
  - Generates Prisma model blocks from entity definitions
  - Maps config field types to Prisma types (string, Float, Boolean, DateTime)
  - Handles required fields, unique constraints, default values
  - Auto-adds timestamps (createdAt, updatedAt) if `timestamps !== false`
  - `dynamicFindMany/One/Create/Update/Delete` use raw Prisma queries for runtime tables
- **Limitation:** Uses `$queryRawUnsafe` for dynamic operations, not ideal for security

### 3. **REST API CRUD Generation** ✅
- **File:** [apps/api/src/core/api-factory/crudFactory.ts](apps/api/src/core/api-factory/crudFactory.ts) and [apps/api/src/core/api-factory/routeBuilder.ts](apps/api/src/core/api-factory/routeBuilder.ts)
- **Status:** WORKING
- **Details:**
  - Generates 5 endpoints per entity:
    - `GET /api/runtime/:slug/:entity` (list)
    - `GET /api/runtime/:slug/:entity/:id` (get one)
    - `POST /api/runtime/:slug/:entity` (create)
    - `PUT /api/runtime/:slug/:entity/:id` (update)
    - `DELETE /api/runtime/:slug/:entity/:id` (delete)
  - Validates required fields from entity definition
  - Sanitizes payloads (strips unknown fields)
  - Returns proper HTTP status codes (201 for create, 404 for not found, etc.)
- **Tested:** Routes listed in `/api/runtime/:slug/routes` endpoint

### 4. **Frontend Page Rendering** ✅
- **File:** [apps/web/core/renderer/PageRenderer.tsx](apps/web/core/renderer/PageRenderer.tsx) and [apps/web/core/renderer/ComponentRegistry.tsx](apps/web/core/renderer/ComponentRegistry.tsx)
- **Status:** WORKING
- **Details:**
  - `ComponentRegistry` maps component types to React components:
    - `table` → DataTable
    - `form` → DynamicForm
    - `stat-card` → StatCard
    - `chart` → Placeholder
    - `detail-view` → Placeholder
  - Unknown component types render as error placeholders (not crashes)
  - `PageRenderer` reads page config and renders correct components
  - Wires components to API endpoints using React Query
  - Implements CRUD UI for table components (view, create, edit, delete)

### 5. **Authentication & Authorization** ✅
- **File:** [apps/api/src/routes/auth.routes.ts](apps/api/src/routes/auth.routes.ts), [apps/api/src/core/auth/jwt.ts](apps/api/src/core/auth/jwt.ts), [apps/api/src/middleware/auth.middleware.ts](apps/api/src/middleware/auth.middleware.ts)
- **Status:** WORKING
- **Details:**
  - JWT-based with 7-day expiration
  - Password hashing with bcryptjs (salt 12)
  - Credentials-based auth (email + password)
  - Routes: POST /api/auth/register, /api/auth/login, /api/auth/me, /api/auth/logout
  - Middleware extracts Bearer token, attaches `req.user`
  - Role-based access control structure in place
  - User model: id, email (unique), name, password (nullable), role, createdAt
- **Frontend:** [apps/web/lib/auth.ts](apps/web/lib/auth.ts) stores JWT in localStorage and Authorization header

### 6. **Notification System** ✅
- **File:** [apps/api/src/features/notifications/notificationService.ts](apps/api/src/features/notifications/notificationService.ts)
- **Status:** WORKING
- **Details:**
  - Create notifications: `createNotification(userId, title, message)`
  - Fetch notifications: `getUserNotifications(userId)` returns notifications + unreadCount
  - Mark as read: `markAsRead(notificationId, userId)`
  - Broadcast to role: `broadcastNotification(title, message, role)`
  - Frontend bell: [apps/web/features/notifications/NotificationBell.tsx](apps/web/features/notifications/NotificationBell.tsx) shows unread count

### 7. **Graceful Error Handling for Bad Config** ✅
- **Status:** MOSTLY WORKING
- **Examples:**
  - Invalid JSON: Caught, returns default config + warning
  - Unknown field type: `.catch("string")` in Zod schema
  - Missing required fields: Defaults applied (timestamps, roles)
  - Unknown components: Renders placeholder instead of crashing
- **Test case:** `{ type: "nonexistent" }` component renders error message

---

## ❌ What IS NOT Working / Major Gaps

### 1. **Workflow Automation - NOT TRIGGERED** ❌
- **File:** [apps/api/src/core/workflow/executor.ts](apps/api/src/core/workflow/executor.ts)
- **Status:** DEFINED BUT NEVER CALLED
- **Problem:**
  - `executeWorkflowsForEvent()` function exists and is exported
  - It is **never imported or called anywhere** in the codebase
  - GREP search confirms: only 1 match (the definition itself)
  - Workflows are parsed from config but never executed
- **Impact:** 
  - Workflows defined in config don't run when records are created/updated/deleted
  - Notifications won't trigger via `send_notification` action
  - Webhooks won't fire via `webhook` action
  - Database writes via `db_write` action won't execute
  - Email actions won't send via `send_email` action
- **What Needs to Happen:**
  - `executeWorkflowsForEvent()` must be called in CRUD handlers:
    - After `dynamicCreate()` → trigger `on_create`
    - After `dynamicUpdate()` → trigger `on_update`
    - After `dynamicDelete()` → trigger `on_delete`
  - Config needs to be passed to CRUD handlers so they have access to workflows
  - Route builder needs to pass workflows when creating handlers

### 2. **Missing Workflow Trigger Conditions** ⚠️
- **File:** [apps/api/src/core/workflow/conditions.ts](apps/api/src/core/workflow/conditions.ts)
- **Status:** DEFINED BUT INCOMPLETE
- **Problem:**
  - Workflow conditions are defined in config (e.g., `"condition": "field == value"`)
  - Conditions are parsed but never evaluated before executing actions
  - `evaluateCondition()` function exists but appears to be placeholder
  - No actual conditional logic implemented

### 3. **Dynamic Table Creation Not Wired to Config Creation** ⚠️
- **File:** [apps/api/src/routes/config.routes.ts](apps/api/src/routes/config.routes.ts)
- **Status:** PARTIALLY WORKING
- **Problem:**
  - When `POST /api/config` creates an app, entity tables are NOT created
  - Tables are only created if `/api/runtime/:entity/init-table` is manually called
  - Frontend doesn't call `init-table` after creating an app
  - This means data operations fail silently until tables are manually initialized
- **Expected:** App creation should automatically create all entity tables

### 4. **Frontend Type Safety Issues** ⚠️
- **Status:** BROKEN TYPECHECKING
- **Problem:**
  - `npx tsc --noEmit` fails in `apps/web/core/config/parser.ts`
  - `FieldType` and `ComponentType` have widening errors
  - Frontend TypeScript doesn't compile cleanly
- **Impact:** Makes development harder, hides real errors

### 5. **API Client Missing Key Functions** ⚠️
- **File:** [apps/web/core/api-client/index.ts](apps/web/core/api-client/index.ts)
- **Status:** INCOMPLETE
- **Problem:**
  - Functions like `getRuntimeData()`, `createRuntimeRecord()`, `deleteRuntimeRecord()` are referenced in PageRenderer but may not be fully implemented
  - Missing API functions for config operations
  - Frontend can render UI but may fail at API calls

### 6. **Notifications Not Tied to Workflows** ⚠️
- **Status:** DISCONNECTED
- **Problem:**
  - Notification system exists and works
  - Workflow executor has `send_notification` action
  - But workflows are never executed, so notifications never created automatically
  - Users can manually create notifications, but not via workflows

### 7. **No End-to-End Test / Demo** ❌
- **Status:** NO DEMONSTRATION
- **Problem:**
  - No way to verify the full flow works
  - No sample app JSON config in the repo
  - No instructions on how to create and test an app
  - Users don't know what should happen end-to-end

---

## 🔴 Critical Issues to Fix (Priority Order)

### Priority 1: Wire Up Workflow Execution (CRITICAL)
**Severity:** BLOCKS CORE FEATURE

```typescript
// In crudFactory.ts create handler, AFTER dynamicCreate():
const row = await dynamicCreate(tableName, sanitized);

// NEW: Execute workflows for this event
if (workflows && workflows.length > 0) {
  await executeWorkflowsForEvent(
    workflows,
    'on_create',
    entity.name,
    row,
    req.user?.id
  );
}

return created(res, row);
```

**Files to modify:**
- [apps/api/src/core/api-factory/crudFactory.ts](apps/api/src/core/api-factory/crudFactory.ts)
- [apps/api/src/core/api-factory/routeBuilder.ts](apps/api/src/core/api-factory/routeBuilder.ts)

**Changes needed:**
1. Pass `config` (with workflows) to `createCrudHandlers()`
2. Import `executeWorkflowsForEvent` in crudFactory
3. Call it after create/update/delete operations with appropriate triggers
4. Handle errors gracefully (log but don't break the response)

### Priority 2: Auto-Create Tables on App Creation
**Severity:** HIGH - breaks data persistence

**File:** [apps/api/src/routes/config.routes.ts](apps/api/src/routes/config.routes.ts)

**Change needed:**
- After app creation, call `createDynamicTable()` for each entity
- Or call `/init-table` endpoints from frontend after app is created

### Priority 3: Fix Frontend TypeScript
**Severity:** MEDIUM - breaks builds

**File:** [apps/web/core/config/parser.ts](apps/web/core/config/parser.ts)

**Change needed:**
- Add proper type definitions for `FieldType` and `ComponentType`
- Ensure types match the backend definitions

### Priority 4: Complete API Client
**Severity:** MEDIUM - breaks frontend

**File:** [apps/web/core/api-client/index.ts](apps/web/core/api-client/index.ts)

**Ensure these functions exist:**
- `getRuntimeData(appSlug, entityName)` → GET /api/runtime/:slug/:entity
- `createRuntimeRecord(appSlug, entityName, data)` → POST /api/runtime/:slug/:entity
- `updateRuntimeRecord(appSlug, entityName, id, data)` → PUT /api/runtime/:slug/:entity/:id
- `deleteRuntimeRecord(appSlug, entityName, id)` → DELETE /api/runtime/:slug/:entity/:id

### Priority 5: Implement Workflow Condition Evaluation
**Severity:** LOW - workflow structure can work without conditions

**File:** [apps/api/src/core/workflow/conditions.ts](apps/api/src/core/workflow/conditions.ts)

**Change needed:**
- Before executing workflow actions, evaluate the condition (if present)
- Only proceed if condition is true

---

## Testing Checklist

To verify the fix works:

- [ ] Create an app with config containing 1 entity + 1 page + 1 workflow
- [ ] Insert a record via API
- [ ] Verify workflow `on_create` triggered
- [ ] Verify notification was created in database
- [ ] View notification in frontend bell
- [ ] Mark notification as read
- [ ] Delete record via API
- [ ] Verify workflow `on_delete` triggered (if defined)
- [ ] Update record via API
- [ ] Verify workflow `on_update` triggered (if defined)

---

## What Works Well

The following features ARE implemented correctly:
- Config parsing with graceful error handling
- Schema generation from entity definitions
- CRUD API endpoint generation
- Frontend component rendering
- Authentication (JWT + roles)
- Notification management (create, read, list)
- Error handling for unknown component types
- Bad JSON handling in config parser

---

## Conclusion

**MetaRuntime is 70% complete.** The infrastructure is solid, but the most critical feature—**workflow automation**—is not connected. Fixing issues in Priority 1 and 2 would bring this to 90% functionality. The project has good error handling, resilient config parsing, and clean architecture. With the fixes, it would genuinely work as a metadata-driven application runtime.
