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

🧱 PHASE 0 — Strategy Decisions (LOCK BEFORE CODING)
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

🧹 PHASE 1 — Remove Legacy Product Features
🔥 Delete Entire Feature Domains
Backend (routes + services + collections)

* Remove: AI Chat, Courses, Questionnaires, Insights, AI Wizard, Marketing, WordPress bridge.
* Assets: Delete backend/src/assets/bridge.js and frontend/public/gymind-woocommerce-plugin.zip.
Frontend
* Delete: chat/, courses/, questionnaire/, marketing/ folders.
* Delete Pages: AiMentorWizard, ChatSettingsPage, PersonalInsightsPage, Course/Quiz management.
Firestore Collections
* Delete: chatPersonas, conversations, triggerPhrases, courses, userCourseProgress, questionnaires, questions, answers, userQuestionnaireResults, personalInsights, newsletterCampaigns, newsletterEditions, triggerEnrollments, unsubscriptions.

🏗️ PHASE 2 — Preserve \& Stabilize Core Shell
✅ Keep \& Refactor

* Auth system (JWT + OAuth), Middleware (auth, rate limit, sanitization), Email service \& Audit logging.
* Contexts: AuthContext, DataContext.
* Layout: MainLayout.
🛠 Adjustments
* Disable plans \& billing middleware temporarily.

🔤 PHASE 3 — Deep Terminology Refactor (CODE + UI)

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

🧩 PHASE 4 — New Data Model Implementation
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

🧩 PHASE 4.1 — COLUMN TYPES (FINAL MVP SPEC)
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

🔐 PHASE 5 — Security Rules
Update rules for the new 6-level hierarchy:

* Organizations: Only members can read.
* Workspaces: Only members of the parent Org can read.
* Items: Read/Write if user.organizationId == item.organizationId.

⚙️ PHASE 6 — Backend APIs
Build new endpoints:

* Boards: POST /boards, GET /boards, PATCH /boards/:id
* Groups: POST /boards/:boardId/groups, DELETE /groups/:id
* Items: POST /items, GET /items (with board/workspace filters)
* Columns: Management of columns (Definitions)

🎨 PHASE 7 — Frontend Core Features (Logyx UI)
Boards UI

* Board list \& Board view with real-time onSnapshot updates.
Groups \& Items
* Table UI with inline editing.
* Drag \& Drop (Items between groups).
Column System
* Full support for types defined in Phase 4.1 (Status, Number, Date, etc.).
* Global organization labels for Status/Dropdown.

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

