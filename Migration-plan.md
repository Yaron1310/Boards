MIGRATION PLAN — From Learning App (Gymind) ➜ To "Monday.com" like Work Management App (Logyx) using the existing shell (auth, security, middleware).
🎯 Goal

Convert the existing system into a multi-tenant work management platform (Logyx) with a strict 6-level hierarchy:

1. Organizations (Top-level company/tenant - This entity currently named "Academy" and should be changed to "Organization")
2. Workspaces (Sub-units/Departments/Teams - This entity currently named "Organization" and should be changed to "Workspace")
3. Boards (Specific projects or workstreams)
4. Groups (Sections within a board, e.g., "This Week", "Backlog")
5. Items (The individual rows/tasks)
6. Column Values (The data in each cell: Status, Date, People, etc.)

Features:

* Cross-board dashboards (querying across the entire Organization)
* Flat item storage for high-performance scalability
* Existing shell (auth, security, middleware) preserved but renamed
* Full terminology refactor (Academy -> Organization, Organization -> Workspace)

✅ PHASE 0 — Strategy Decisions (DONE)
Final architecture decisions

Logyx 6-Level Hierarchy:

1. Organization (Company/Tenant) - Field: organizationId | Collection: /organizations
2. Workspace (Department/Area) - Field: workspaceId | Collection: /workspaces (nested or root)
3. Board (Project/Campaign) - Field: boardId | Collection: /organizations/{id}/boards
4. Group (Phase/Week/Category) - Field: groupId | Collection: /organizations/{id}/boards/{id}/groups
5. Item (The Row/Task) - Field: itemId | Collection: /organizations/{organizationId}/items
6. Column Values (Dynamic data) - Field: values: {} | Stored inside Item document

Plans
❌ Disabled for now (no gating, no billing enforcement)

Core Data Model (Flat Items)
Items are stored at the Organization level to allow cross-board dashboards without "collection group" complexity.
Path: /organizations/{organizationId}/items/{itemId}

✅ PHASE 1 — Remove Legacy Product Features (DONE)
🔥 Delete Entire Feature Domains
Backend (routes + services + collections)

* ✅ Remove: AI Chat, Courses, Questionnaires, Insights, AI Wizard, Marketing, WordPress bridge.
* ✅ Assets: Delete backend/src/assets/bridge.js and frontend/public/gymind-woocommerce-plugin.zip.
Frontend
* ✅ Delete: chat/, courses/, questionnaire/, marketing/ folders.
* ✅ Delete Pages: AiMentorWizard, ChatSettingsPage, PersonalInsightsPage, Course/Quiz management.
Firestore Collections
* ✅ Delete: chatPersonas, conversations, triggerPhrases, courses, userCourseProgress, questionnaires, questions, answers, userQuestionnaireResults, personalInsights, newsletterCampaigns, newsletterEditions, triggerEnrollments, unsubscriptions.

✅ PHASE 2 — Preserve & Stabilize Core Shell (DONE)
✅ Keep & Refactor

* ✅ Auth system (JWT + OAuth), Middleware (auth, rate limit, sanitization), Email service & Audit logging.
* ✅ Contexts: AuthContext, DataContext.
* ✅ Layout: MainLayout.
🛠 Adjustments
* ✅ Disable plans & billing middleware temporarily.

🔤 PHASE 3 — Deep Terminology Refactor (CODE + UI) (DONE)

Rename all occurrences (Files, Components, Types, Variables, Enum values):

Domain Terminology:
Old Term (Gymind)      ➜  New Term (Logyx)
Academy                ➜  Organization
Organization           ➜  Workspace

Role Mapping (UserRole Enum):
Old Enum Value         ➜  New Enum Value
ACADEMY\_ADMIN          ➜  ORGANIZATION\_ADMIN
ORGANIZATION\_ADMIN     ➜  WORKSPACE\_ADMIN
(REGULAR\_USER and SYSTEM\_ADMIN remain same)

ID \& Variable Mapping:
Old Variable/Field     ➜  New Variable/Field
academyId              ➜  organizationId
organizationId         ➜  workspaceId

Tasks:

1. Rename frontend components (AcademyAdminsModal -> OrganizationAdminsModal).
2. Rename backend controllers/routes (academy.controller.ts -> organization.controller.ts).
3. Update TypeScript interfaces (types.ts) for both frontend/backend.
4. Global Find \& Replace for academyId -> organizationId.
5. Global Find \& Replace for organizationId -> workspaceId.
6. Update DB collection names in collections.ts (academies -> organizations).

✅ 🧩 PHASE 4 — New Data Model Implementation (DONE)
📦 Firestore Structure
Items (The core of the system)
/organizations/{organizationId}/items/{itemId}
Fields: { organizationId, workspaceId, boardId, groupId, name, order, createdBy, values: {} }

Boards
/organizations/{organizationId}/boards/{boardId}

Groups
/organizations/{organizationId}/boards/{boardId}/groups/{groupId}

Column Definitions (Global to Organization)
/organizations/{organizationId}/columns/{columnId}
(See Phase 4.1 for detailed schema)

🧠 Key Design Rules

* Items are NOT nested under boards (enables Dashboards).
* Real-time: UI uses onSnapshot to listen for changes on items.

✅ 🧩 PHASE 4.1 — COLUMN TYPES (FINAL MVP SPEC) (DONE)
🎯 Goals
Support real business use cases (tasks, budgets, CRM)
Keep backend simple (no computation engine)
Enable dashboards + filtering
Avoid architectural traps (formulas, mirrors)
📦 BASE COLUMN MODEL
Collection
/organizations/{organizationId}/columns/{columnId}
Schema
type Column = {
  id: string
  organizationId: string

  name: string
  type: ColumnType

  settings: Record<string, any>

  createdAt: Timestamp
  updatedAt: Timestamp
}
🧠 COLUMN VALUE STORAGE (ITEM)

Inside:

/organizations/{organizationId}/items/{itemId}
values: {
  [columnId]: any
}
🟢 SUPPORTED COLUMN TYPES (MVP)
1. 📝 TEXT
type: "text"
value: string
Settings
{
  maxLength?: number
  multiline?: boolean // supports "long text"
}
2. 🔢 NUMBER
type: "number"
value: number
Settings
{
  precision?: number
  unit?: string // ₪, $, %, etc.
}
Supports
✅ dashboard aggregations
✅ column summaries
3. 📅 DATE
type: "date"
value: Timestamp
Settings
{
  includeTime?: boolean
}
Notes
Used for filtering (critical for dashboards)
4. 🚦 STATUS
type: "status"
value: string // optionId
Settings
{
  options: [
    { id: "todo", label: "To Do", color: "#ccc" },
    { id: "done", label: "Done", color: "#0f0" }
  ]
}
Special Behavior
May map to top-level status field (for indexing)
5. 👤 PERSON
type: "person"
value: string[] // userIds
Settings
{
  multiple: boolean
}
Special Behavior
May map to top-level assignees
6. 🔽 DROPDOWN
type: "dropdown"
value: string[] // optionIds
Settings
{
  options: [{ id, label }]
  multiple: boolean
}
7. ☑️ CHECKBOX
type: "checkbox"
value: boolean
Notes
Simple and very useful for workflows
8. 🏷️ TAGS (Lightweight)
type: "tags"
value: string[] // tag names
Settings
{
  allowCustom: true
}

👉 No global tag system in MVP (keep simple)

9. ⏱️ TIME (Optional MVP+)
type: "time"
value: string // "HH:mm"
10. 📧 EMAIL (Validation Only)
type: "email"
value: string
11. 📞 PHONE (Validation Only)
type: "phone"
value: string
12. 📍 LOCATION (Simple Version)
type: "location"
value: {
  address: string
}
13. ⏳ TIME RANGE (Optional MVP+)
type: "time_range"
value: {
  start: Timestamp
  end: Timestamp
}
🟡 “COMPUTED” (SAFE MVP VERSION)
14. 🧮 SIMPLE FORMULA (LIMITED)

👉 THIS IS NOT a real formula engine

type: "simple_formula"
value: NOT STORED (computed in UI or backend on write)
Settings
{
  operation: "add" | "subtract" | "multiply" | "divide"
  fields: [columnId1, columnId2]
}
Behavior Options
Option A (recommended for MVP)
Computed in UI only
Not stored
Not queryable
Option B (slightly more advanced)
Computed on write
Stored in values
Queryable
Constraints
Max 2 fields
No chaining
No nesting
Same row only
🔴 EXCLUDED FROM MVP (INTENTIONALLY)
❌ Full Formula Engine
No expressions
No dependency graph
❌ Mirror Columns
No cross-board references
❌ Dependency Columns
No task relationships
❌ File Attachments
Add later (storage complexity)
⚡ INDEXING STRATEGY (CRITICAL)

Because Firestore cannot index dynamic fields:

Mirror important fields to top-level:
{
  status: string
  assignees: string[]
  dueDate: timestamp
}
📊 COLUMN SUMMARY (UI FEATURE)

Each column may define:

settings: {
  summary?: "sum" | "avg" | "min" | "max" | "count"
}

👉 Computed in frontend only

🧪 VALIDATION RULES (BACKEND)

For every write:

Match type to value
Validate:
number → numeric
date → timestamp
status → valid optionId
person → valid userIds
Enforce limits:
maxLength
precision

✅ 🔐 PHASE 5 — Security Rules (DONE)

### 5.0 — Foundation
All authorization is enforced at the Express backend layer. Firestore rules stay deny-all — the backend is the sole trust boundary.

JWT payload carries: `userId`, `role`, `orgId` (tenant), `selectedOrganizationId` (workspace).

Tenant isolation rule: every Firestore query must filter by `organizationId === user.orgId`.

Role hierarchy (lowest → highest): `REGULAR_USER` < `ORGANIZATION_ADMIN` < `ACADEMY_ADMIN` < `SYSTEM_ADMIN`

`SYSTEM_ADMIN` bypasses all tenancy checks.

Implementation: `backend/src/utils/workManagementAuth.ts` — authorization helper functions used by Phase 6 controllers.

---

### 5.1 — Organizations & Workspaces
Carry-over from Phase 2/3 (already implemented). No changes.
* Organizations: read/write by ACADEMY\_ADMIN (own org) or SYSTEM\_ADMIN.
* Workspaces: CRUD by ORGANIZATION\_ADMIN (own), ACADEMY\_ADMIN (own org), SYSTEM\_ADMIN.

---

### 5.2 — Boards
| Operation | Who |
|-----------|-----|
| Read list | Any member whose `orgId` matches `board.organizationId` |
| Read single | Same — or ACADEMY\_ADMIN+ for any board in their org |
| Create | ORGANIZATION\_ADMIN+, scoped to their workspaceId |
| Update | Board creator (`createdBy === userId`) OR ORGANIZATION\_ADMIN (own workspace) OR ACADEMY\_ADMIN+ |
| Archive (soft-delete) | ORGANIZATION\_ADMIN (own workspace) OR ACADEMY\_ADMIN+ |
| Hard-delete | ACADEMY\_ADMIN or SYSTEM\_ADMIN only |

Validation on write:
* `board.organizationId` must equal `user.orgId`
* `board.workspaceId` must be an existing workspace under that orgId

---

### 5.3 — Groups
| Operation | Who |
|-----------|-----|
| Read | Same access as the parent board |
| Create / Update | ORGANIZATION\_ADMIN+ OR board creator |
| Delete | ORGANIZATION\_ADMIN+ (hard-delete acceptable for groups) |

Validation on write:
* `group.boardId` must exist in `boardsCollection(user.orgId)` — prevents cross-tenant injection

---

### 5.4 — Items
| Operation | Who |
|-----------|-----|
| Read | `item.organizationId === user.orgId` OR `userId in item.assignees` |
| Create | Member of the workspace: `selectedOrganizationId === item.workspaceId` |
| Update | Item creator (`createdBy`) OR assignee (`userId in item.assignees`) OR ORGANIZATION\_ADMIN+ |
| Archive | Item creator OR ORGANIZATION\_ADMIN+ |
| Hard-delete | ORGANIZATION\_ADMIN+ only |

Ownership chain validation on create/update:
1. `boardId` must exist under `boardsCollection(user.orgId)`
2. `groupId` must exist under `groupsCollection(user.orgId, boardId)`
3. `board.workspaceId` must equal `item.workspaceId` — no cross-workspace item injection

Column value validation on every write: run `validateColumnValue()` for each key in `values` map.

---

### 5.5 — Columns
| Operation | Who |
|-----------|-----|
| Read | Any org member (`orgId` match) — needed to render board UI |
| Create / Update / Delete | ORGANIZATION\_ADMIN, ACADEMY\_ADMIN, SYSTEM\_ADMIN |

Validation on write:
* `column.organizationId` must equal `user.orgId`
* `column.type` must be a valid `ColumnType` enum value

---

### 5.6 — Cross-Cutting Rules
* Field-length middleware applied to all new routes (already exists).
* Rate limiting: authenticated limiter (200 req/15 min) for boards/items/groups/columns routes.
* Archived items (`isArchived: true`) excluded from list queries by default; require explicit `includeArchived` flag.
* `SYSTEM_ADMIN` bypass follows the same pattern as existing controllers.

---

### Out of Scope (deferred)
* Board-level role sharing (inviting collaborators to a specific board) → Phase 9
* Row-level column visibility permissions → post-MVP

✅ ⚙️ PHASE 6 — Backend APIs (DONE)

New files to create:
  backend/src/controllers/board.controller.ts
  backend/src/controllers/group.controller.ts
  backend/src/controllers/item.controller.ts
  backend/src/controllers/column.controller.ts
  backend/src/routes/board.routes.ts
  backend/src/routes/group.routes.ts
  backend/src/routes/item.routes.ts
  backend/src/routes/column.routes.ts

Wire all 4 routers into routes/index.ts under authenticateToken + authenticatedLimiter.

Security on every endpoint: authenticateToken middleware (already applied in mainRouter),
explicit req.body field picking (no object spread), assertXxxAccess() from workManagementAuth.ts.

Audit logging: call logAudit() / logAuditAndCheckAnomaly() on every CREATE, UPDATE, DELETE,
and list READ operation.

Error format: { message: string } — consistent with existing controllers.

--- BOARDS ---

POST   /boards
  Body: { name, description?, workspaceId, order? }
  Validate: workspaceId must be an existing workspace whose orgId === user.orgId
  Auth: assertBoardAccess(user, board, 'create')  — ORGANIZATION_ADMIN+ in their workspace
  Returns: 201 + created board

GET    /boards
  Query: workspaceId? (scopes to a specific workspace),
         includeArchived? (default false)
  Tenant filter: always organizationId === user.orgId
  Auth: results filtered via canAccessBoard(user, board, 'read')
  Audit: logAuditAndCheckAnomaly (READ + anomaly detection)
  Returns: 200 + array of boards ordered by `order`

GET    /boards/:id
  Auth: assertBoardAccess(user, board, 'read')
  Audit: logAuditAndCheckAnomaly
  Returns: 200 + board

PATCH  /boards/:id
  Body: { name?, description?, order? }
  Auth: assertBoardAccess(user, board, 'update')
    — board creator OR ORGANIZATION_ADMIN (own workspace) OR ACADEMY_ADMIN+
  Returns: 200 + updated board

PATCH  /boards/:id/archive
  Auth: assertBoardAccess(user, board, 'archive')
    — ORGANIZATION_ADMIN (own workspace) OR ACADEMY_ADMIN+
  Sets isArchived: true
  Returns: 200

PATCH  /boards/:id/restore
  Auth: assertBoardAccess(user, board, 'archive')  — same permission level
  Sets isArchived: false
  Returns: 200 + restored board

DELETE /boards/:id              (hard-delete — ACADEMY_ADMIN+ only)
  Auth: assertBoardAccess(user, board, 'delete')
  Cascade: batch-delete all groups under the board
  Note: items become orphaned (acceptable for MVP — addressed in Phase 9)
  Returns: 204

--- GROUPS ---

GET    /boards/:boardId/groups
  Auth: assertBoardAccess(user, board, 'read')  — inherit from parent board
  Returns: 200 + array of groups ordered by `order`

POST   /boards/:boardId/groups
  Body: { name, color?, order? }
  Validate: validateGroupOwnershipChain(orgId, boardId)
  Auth: assertGroupAccess(user, group, 'create', board.createdBy)
    — ORGANIZATION_ADMIN+ OR board creator
  Returns: 201 + created group

PATCH  /boards/:boardId/groups/reorder    ← defined BEFORE /:groupId to avoid route conflict
  Body: { order: [{ id, order }] }
  Auth: assertBoardAccess(user, board, 'update')
  Batch-writes order field on all specified groups
  Returns: 200

PATCH  /boards/:boardId/groups/:groupId
  Body: { name?, color?, isCollapsed?, order? }
  Auth: assertGroupAccess(user, group, 'update', board.createdBy)
  Returns: 200 + updated group

DELETE /boards/:boardId/groups/:groupId
  Auth: assertGroupAccess(user, group, 'delete', board.createdBy)
    — ORGANIZATION_ADMIN+ (hard-delete acceptable per Phase 5.3)
  Note: items in this group become orphaned (acceptable for MVP)
  Returns: 204

--- ITEMS ---

POST   /items
  Body: { name, workspaceId, boardId, groupId, order?, values?,
          assignees?, status?, dueDate? }
  Validate: validateItemOwnershipChain(orgId, workspaceId, boardId, groupId)
  Validate: validateColumnValue() for each key in values (fetch column defs)
  Mirror: scan values map — STATUS column → item.status, PERSON → item.assignees,
          DATE → item.dueDate (first match of each type)
  Auth: assertItemAccess(user, item, 'create')
    — workspace member: selectedOrganizationId === item.workspaceId
  Returns: 201 + created item

GET    /items
  Query params:
    boardId?       — filter by board
    groupId?       — filter by group (requires boardId)
    workspaceId?   — filter by workspace
    assignee?      — filter by userId in assignees array
    status?        — filter by top-level status string
    dueDateFrom?   — filter dueDate >= ISO string
    dueDateTo?     — filter dueDate <= ISO string
    includeArchived? (default false)
    cursor?        — cursor-based pagination token (document ID)
    limit?         — page size (default 50, max 200)
  Tenant isolation: always filter by organizationId === user.orgId
  Auth: results filtered via canAccessItem(user, item, 'read')
  Audit: logAuditAndCheckAnomaly (anomaly detection for bulk reads)
  Returns: 200 + PaginatedResult<DBItem>

GET    /items/:id
  Auth: assertItemAccess(user, item, 'read')
  Audit: logAuditAndCheckAnomaly
  Returns: 200 + item

PATCH  /items/reorder             ← defined BEFORE /:id to avoid route conflict
  Body: { updates: [{ id, groupId, order }] }
  Auth: each item must pass assertItemAccess(user, item, 'update')
  Batch-writes groupId + order (supports moving items between groups)
  Returns: 200

PATCH  /items/:id
  Body: { name?, groupId?, order?, values?, assignees?, status?, dueDate? }
  Validate: if groupId changes, re-run validateItemOwnershipChain
  Validate: validateColumnValue() for each key in values
  Mirror: update top-level status/assignees/dueDate if relevant columns change
  Auth: assertItemAccess(user, item, 'update')
    — item creator OR assignee OR ORGANIZATION_ADMIN+
  Returns: 200 + updated item

PATCH  /items/:id/archive
  Auth: assertItemAccess(user, item, 'archive')
  Sets isArchived: true
  Returns: 200

PATCH  /items/:id/restore
  Auth: assertItemAccess(user, item, 'archive')
  Sets isArchived: false
  Returns: 200

DELETE /items/:id              (hard-delete — ORGANIZATION_ADMIN+ only)
  Auth: assertItemAccess(user, item, 'delete')
  Returns: 204

--- COLUMNS ---

GET    /columns
  Tenant filter: organizationId === user.orgId
  Auth: any org member (canAccessColumn read)
  Returns: 200 + array of columns

GET    /columns/:id
  Auth: assertColumnAccess(user, column, 'read')
  Returns: 200 + column

POST   /columns
  Body: { name, type (valid ColumnType enum value), settings? }
  Validate: type is a valid ColumnType value
  Validate: settings shape matches type
    — STATUS requires settings.options array with { id, label, color } entries
    — DROPDOWN requires settings.options array + settings.multiple (boolean)
    — SIMPLE_FORMULA requires settings.operation + settings.fields (2 columnIds)
    — other types: settings optional
  Auth: assertColumnAccess(user, column, 'create')  — ORGANIZATION_ADMIN+
  Returns: 201 + created column

PATCH  /columns/reorder           ← defined BEFORE /:id to avoid route conflict
  Body: { order: [{ id, order }] }
  Auth: assertColumnAccess (any column in org, 'update')  — ORGANIZATION_ADMIN+
  Batch-writes order field
  Returns: 200

PATCH  /columns/:id
  Body: { name?, settings? }
  Validate: updated settings shape still matches the existing column type
  Auth: assertColumnAccess(user, column, 'update')
  Returns: 200 + updated column

DELETE /columns/:id
  Auth: assertColumnAccess(user, column, 'delete')
  Note: existing item values keyed by this columnId become stale (acceptable for MVP)
  Returns: 204

🎨 PHASE 7 — Frontend Core Features (Logyx UI)

Goal: Build the complete work-management UI on top of the Phase 6 backend. This phase turns the existing shell (auth, admin, layout) into a fully functional board-based task manager.

Session risk key: 🟢 Low · 🟡 Low-Medium · 🟠 Medium · 🔴 High (context limit risk)
Sub-phases are sized by session risk, not equal effort. ⚫ Heavy sections each get their own session (7D, 7F) to avoid hitting the context limit.

---

## 📦 PHASE 7A — Foundation | 🟢 Low risk
> Data layer, routing, and navigation. Nothing else can be built without these. All tasks are small wiring/boilerplate files.

### 7.0 — Service Layer (API Client)

New file: `frontend/src/services/workManagementService.ts`
Wrap all Phase 6 REST endpoints using the existing Axios/fetch pattern from `geminiService.ts`.

Functions to expose:
- **Boards**: `createBoard`, `listBoards(workspaceId?, includeArchived?)`, `getBoard(id)`, `updateBoard(id, patch)`, `archiveBoard(id)`, `restoreBoard(id)`, `deleteBoard(id)`
- **Groups**: `listGroups(boardId)`, `createGroup(boardId, data)`, `updateGroup(boardId, groupId, patch)`, `deleteGroup(boardId, groupId)`, `reorderGroups(boardId, order[])`
- **Items**: `createItem(data)`, `listItems(params)`, `getItem(id)`, `updateItem(id, patch)`, `reorderItems(updates[])`, `archiveItem(id)`, `restoreItem(id)`, `deleteItem(id)`
- **Columns**: `listColumns()`, `getColumn(id)`, `createColumn(data)`, `updateColumn(id, patch)`, `reorderColumns(order[])`, `deleteColumn(id)`

---

### 7.1 — React Query Hooks

New files in `frontend/src/hooks/queries/`:
- `useBoardQueries.ts` — `useBoards(workspaceId?)`, `useBoard(id)`, board mutation hooks
- `useGroupQueries.ts` — `useGroups(boardId)`, group mutation hooks
- `useItemQueries.ts` — `useItems(params)`, `useItem(id)`, item mutation hooks
- `useColumnQueries.ts` — `useColumns()`, `useColumn(id)`, column mutation hooks

Add query keys to `queryKeys.ts`:
```
boards, board(id), groups(boardId), items(params), item(id), columns, column(id)
```

Real-time via Firestore `onSnapshot`:
- Subscribe to `/organizations/{orgId}/items` filtered by `boardId` in the board view.
- Invalidate React Query cache on snapshot change (or replace with live Firestore listener using a custom hook `useLiveItems(boardId)`).

---

### 7.2 — Routing

Add new routes to `App.tsx` under the `MainLayout` protected wrapper:

| Path | Component | Roles |
|------|-----------|-------|
| `/workspaces` | `WorkspaceHomePage` | All authenticated |
| `/workspaces/:workspaceId/boards` | `BoardListPage` | All authenticated |
| `/boards/:boardId` | `BoardViewPage` | All authenticated |
| `/admin/columns` | `ColumnManagementPage` | ORGANIZATION_ADMIN+ |

Default authenticated redirect: `/` → `/workspaces`

---

### 7.3 — Sidebar & Navigation

Update `MainLayout.tsx`:
- Add a **Workspaces** section in the sidebar that lists the user's workspaces.
- Under the selected workspace, show a collapsible list of its boards (fetched via `useBoards(workspaceId)`).
- Active board highlighted; clicking navigates to `/boards/:boardId`.
- "+ New Board" button (visible to ORGANIZATION_ADMIN+) opens `CreateBoardModal`.
- Preserve all existing admin/profile nav links.

---

### 7.16 — TypeScript & Linting

- All new components must use types from `types.ts` (Board, Group, Item, Column, ColumnType, etc.).
- Zero ESLint warnings (enforce with `npm run lint` before each commit).
- No `any` types in component props; use explicit interfaces.

---

### 7.17 — Entry Point Updates

- `App.tsx`: add the 4 new routes from 7.2.
- `MainLayout.tsx`: add sidebar board navigation (7.3).
- `geminiService.ts` or new `workManagementService.ts`: export all API functions (7.0).
- `hooks/queries/index.ts`: export all new query hooks.

---

## 🏗️ PHASE 7B — Pages & Board Skeleton | 🟡 Low-Medium risk
> Workspace home, board list, board view container, and column header. Multiple components but each is individually moderate. No complex interactivity yet.

### 7.4 — Workspace Home Page

New component: `frontend/src/components/boards/WorkspaceHomePage.tsx`
- Grid/list of workspaces the user belongs to.
- Each card links to `/workspaces/:workspaceId/boards`.
- Shows workspace name, member count, active board count.

---

### 7.5 — Board List Page

New component: `frontend/src/components/boards/BoardListPage.tsx`
- Lists all boards in a workspace.
- Shows board name, description, creation date, creator.
- "New Board" button → `CreateBoardModal`.
- Archive toggle (ORGANIZATION_ADMIN+): shows/hides archived boards.
- Click a board → navigate to `/boards/:boardId`.

New component: `frontend/src/components/boards/CreateBoardModal.tsx`
- Fields: name (required), description (optional).
- Submits `createBoard({ name, description, workspaceId })`.
- On success: invalidate boards query, navigate to new board.

---

### 7.6 — Board View Page

New component: `frontend/src/components/boards/BoardViewPage.tsx`
- Top bar: board name (editable inline by ORGANIZATION_ADMIN+), description, archive button.
- Renders a list of `GroupSection` components ordered by `group.order`.
- "Add Group" button at the bottom (ORGANIZATION_ADMIN+).
- Columns header row shared across all groups.

---

### 7.8 — Column Header Row

New component: `frontend/src/components/boards/ColumnHeader.tsx`
- Renders the sticky column header using the org's column definitions (`useColumns()`).
- Each column header shows: type icon, column name, sort/filter toggle (MVP: sort only).
- "+" button at the end (ORGANIZATION_ADMIN+) opens `AddColumnModal`.
- Drag handles for column reordering (ORGANIZATION_ADMIN+).

---

## 🧩 PHASE 7C — Group Section & Item Row | 🟠 Medium risk
> GroupSection is the most complex structural component (collapse, inline edit, kebab menu). ItemRow depends on it. Build together since GroupSection renders ItemRows.

### 7.7 — Group Section

New component: `frontend/src/components/boards/GroupSection.tsx`
- Group header: color dot, name (editable inline), item count, collapse toggle, kebab menu (rename, delete).
- Collapsed state: hides item rows, shows summary bar.
- Item rows rendered below the header using `ItemRow`.
- "Add Item" row at the bottom of each group.

New component: `frontend/src/components/boards/AddGroupForm.tsx`
- Inline form to create a new group (name + color picker).

---

### 7.9 — Item Row

New component: `frontend/src/components/boards/ItemRow.tsx`
- Fixed columns: checkbox (select), item name.
- Dynamic columns: renders `ColumnCell` for each column in `useColumns()`.
- Hover: show drag handle (left), delete/archive icon (right).
- Click on name → opens `ItemDetailPanel` (side panel).

---

---

## 🎨 PHASE 7D — Column Cell Renderers | 🔴 High risk
> 14 column types × read + edit mode = the largest volume of new files in this phase. Dedicated session — do not combine with anything else.

### 7.10 — Column Cell Renderers & Editors

New folder: `frontend/src/components/boards/cells/`

One component per column type (read view + inline edit mode):

| Column Type | Read View | Edit Mode |
|-------------|-----------|-----------|
| `text` | Truncated string | `<input type="text">` |
| `number` | Formatted number + unit | `<input type="number">` |
| `date` | Formatted date | Date picker |
| `status` | Colored badge | Dropdown of status options |
| `person` | Avatar stack | User multi-select |
| `dropdown` | Tags/chips | Options multi-select |
| `checkbox` | Checkbox icon | Toggle |
| `tags` | Pill list | Tag input with autocomplete |
| `time` | HH:mm string | Time picker |
| `email` | Mailto link | `<input type="email">` |
| `phone` | Formatted phone | `<input type="tel">` |
| `location` | Address string | Address text input |
| `time_range` | Start → End | Two date pickers |
| `simple_formula` | Computed value (read-only) | N/A (computed) |

`ColumnCell.tsx` — dispatcher that renders the correct cell component by `column.type`.

Inline edit behavior:
- Single-click activates edit mode for the cell.
- Blur or Enter confirms and calls `updateItem(id, { values: { [columnId]: newValue } })`.
- Escape cancels.
- Optimistic update via React Query.

---

---

## 🗂️ PHASE 7E — Item Detail & Column Management | 🟠 Medium risk
> Two medium-heavy admin/detail components. Both reuse the cell editors from 7D so 7D must be complete first.

### 7.11 — Item Detail Panel

New component: `frontend/src/components/boards/ItemDetailPanel.tsx`
- Slides in from the right when an item row is clicked.
- Shows: item name (editable), all column values (using same cell editors), assignees, status, due date.
- Archive / Delete actions (permission-gated).
- Close button or click outside dismisses.

---

### 7.12 — Column Management (Admin)

New component: `frontend/src/components/boards/ColumnManagementPage.tsx`
- Table of all org columns: name, type, settings summary, actions.
- "Add Column" button → `AddColumnModal`.
- Reorder via drag-and-drop (calls `reorderColumns`).
- Edit column name/settings inline.
- Delete column (with confirmation — warns about data loss).

New component: `frontend/src/components/boards/AddColumnModal.tsx`
- Fields: name, type selector (all ColumnType values).
- Conditional settings fields based on selected type:
  - `status` / `dropdown`: options builder (add/remove/recolor options).
  - `number`: unit, precision.
  - `text`: maxLength, multiline toggle.
  - `person`: multiple toggle.
  - `simple_formula`: operation selector + 2 column selectors.
- Submits to `createColumn`.

---

---

## 🖱️ PHASE 7F — Drag & Drop | 🔴 High risk
> DnD touches every structural component (ItemRow, GroupSection, ColumnHeader) and requires installing + wiring a new library. Dedicated session.

### 7.13 — Drag & Drop

Use `@dnd-kit/core` + `@dnd-kit/sortable` (or `react-beautiful-dnd`).

Interactions:
- **Items within a group**: vertical sort → calls `reorderItems` on drop.
- **Items between groups**: drag an item row to a different `GroupSection` → `reorderItems` with new `groupId`.
- **Groups**: vertical sort of `GroupSection` components → `reorderGroups` on drop.
- **Columns**: horizontal sort of `ColumnHeader` cells → `reorderColumns` on drop (ORGANIZATION_ADMIN+ only).

Optimistic UI: update local order immediately; revert on API error.

---

---

## ✅ PHASE 7G — Real-Time & Accessibility | 🟢 Low risk
> Two focused hooks and a cross-cutting accessibility pass. Light finishing work to complete the phase.

### 7.14 — Real-Time Subscriptions

New hook: `frontend/src/hooks/useLiveItems.ts`
- Uses Firestore `onSnapshot` on `/organizations/{orgId}/items` filtered by `boardId`.
- Pushes results into React Query cache via `queryClient.setQueryData`.
- Cleans up listener on unmount.

New hook: `frontend/src/hooks/useLiveGroups.ts`
- `onSnapshot` on `/organizations/{orgId}/boards/{boardId}/groups`.
- Same cache-injection pattern.

---

### 7.15 — Accessibility (ARIA)

Every new interactive element must have:
- `aria-label` or `aria-labelledby` on all buttons, inputs, modals.
- `role="grid"` on the board table, `role="row"` on item rows, `role="gridcell"` on cells.
- `aria-expanded` on collapsible group headers.
- `aria-grabbed` / `aria-dropeffect` on drag handles.
- Focus trap in all modals (reuse existing `ModalWrapper`).


📊 PHASE 8 — Dashboards (The "Logyx" Power)
Query: /organizations/{organizationId}/items
Filters: workspaceId, boardId, assignee, date.
Widgets:

* Status distribution (Pie/Bar).
* Overdue items tracker.
* Workload by person.

🔄 PHASE 9 — Permissions \& Notifications

* Board-level roles (Viewer/Editor/Admin).
* Notifications for assignments \& mentions.

🧪 PHASE 10 — Testing \& Rollout

* Validate multi-tenancy security.
* Performance testing on flat item queries.
* Deploy backend -> Deploy Boards UI -> Release Dashboards.

