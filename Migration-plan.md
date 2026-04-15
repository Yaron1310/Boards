MIGRATION PLAN — Learning App ➜ Work Management SaaS (Logyx)
🎯 Goal

Convert the existing system into a multi-tenant work management platform with:

Boards, groups, items, columns
Cross-board dashboards
Flat item storage for scalable queries
Existing shell (auth, orgs, security, middleware) preserved
✨ NEW: Full terminology refactor (Academy -> Organization, Organization -> Workspace)
🧱 PHASE 0 — Strategy Decisions (LOCK BEFORE CODING)
Final architecture decisions
Hierarchy
Academy (DB) → becomes Organization (Company/Tenant)
Organization (DB) → becomes Workspace (Project/Team area)
Plans
❌ Disabled for now (no gating, no billing enforcement)
Core data model

Flat items collection:

/academies/{organizationId}/items/{itemId}
(Keeps indexing efficient for cross-board dashboards)
Permissions
Organization-level access
Workspace-level scoping
Real-time: Board views MUST use onSnapshot for live updates
🧹 PHASE 1 — Remove Legacy Product Features
🔥 Delete Entire Feature Domains
Backend (routes + services + collections)

Remove:

AI Chat (/chat, /chat-personas, /conversations, /trigger-phrases, gemini.service.ts)
Courses (/courses, lesson chat + quiz)
Questionnaires (/questionnaires, /questionnaire-results)
Insights (/users/me/insights)
AI Wizard (/ai/mentor-wizard)
Marketing (/marketing/*, newsletter*)
WordPress bridge (/app-config/bridge-*, assets/bridge.js)
Frontend

Delete:

chat/, courses/, questionnaire/, marketing/
AiMentorWizard, ChatSettingsPage, PersonalInsightsPage
All related admin/management pages
Public gymind-woocommerce-plugin.zip
Firestore Collections

Delete completely:

chatPersonas, conversations, triggerPhrases
courses, userCourseProgress
questionnaires, questions, answers, userQuestionnaireResults
personalInsights
newsletterCampaigns, newsletterEditions, triggerEnrollments, unsubscriptions
🧼 Cleanup Tasks
Remove unused imports & API routes
Remove Gemini / AI / Marketing configs & env vars
🏗️ PHASE 2 — Preserve & Stabilize Core Shell
✅ Keep & Refactor
Backend
Auth system (JWT + OAuth)
Middleware (auth, rate limit, sanitization)
Email service & Audit logging
Frontend
Auth flows & Contexts (AuthContext, DataContext)
Layout (MainLayout)
🛠 Adjustments
Disable plans & billing middleware temporarily
🔤 PHASE 3 — Deep Terminology Refactor (CODE + UI)

Rename all occurrences (Files, Components, Types, Variables, Enum values):

Domain Terminology:
Old Term (Gymind)      ➜  New Term (Logyx)
Academy                ➜  Organization
Organization           ➜  Workspace

Role Mapping (UserRole Enum):
Old Enum Value         ➜  New Enum Value
ACADEMY_ADMIN          ➜  ORGANIZATION_ADMIN
ORGANIZATION_ADMIN     ➜  WORKSPACE_ADMIN
(REGULAR_USER and SYSTEM_ADMIN remain same)

ID & Variable Mapping:
Old Variable/Field     ➜  New Variable/Field
academyId              ➜  organizationId
organizationId         ➜  workspaceId

Tasks:
1. Rename frontend components (e.g., AcademyAdminsModal -> OrganizationAdminsModal)
2. Rename backend controllers/routes (e.g., academy.controller.ts -> organization.controller.ts)
3. Update TypeScript interfaces in both frontend/backend
4. Global Find & Replace for academyId -> organizationId (Carefully!)
5. Global Find & Replace for organizationId -> workspaceId (Carefully!)
6. Update DB collection references in collections.ts

⚠️ NOTE: We are doing a "clean break" refactor. This means the code, the UI, and the DB field names (in new/updated documents) will use the Logyx terminology. Existing data in Firestore will need a migration script or we accept "dirty" fields for old data.

🧩 PHASE 4 — New Data Model Implementation
📦 Firestore Structure
Items (CORE)
/academies/{organizationId}/items/{itemId}

Fields:

{
  organizationId
  workspaceId
  boardId
  groupId
  name
  order
  createdBy
  createdAt
  values: { [columnId]: any }
}
Boards
/academies/{organizationId}/boards/{boardId}
Groups
/academies/{organizationId}/boards/{boardId}/groups/{groupId}
Columns (Hybrid Model)
Definitions: /academies/{organizationId}/columnDefinitions/{columnId} (Stores types/labels)
Board Config: /academies/{organizationId}/boards/{boardId} (Stores which columns are active)
🧠 Key Design Rules
Items are NOT nested under boards (allows cross-board queries)
Real-time listeners on the Items collection filtered by boardId
🔐 PHASE 5 — Security Rules

Update rules for the new hierarchy:

Organizations (formerly Academies): Only members can read
Workspaces (formerly Organizations): Only members of the parent Org can read
Items: Read/Write if user.organizationId == item.organizationId
⚙️ PHASE 6 — Backend APIs
Build new endpoints:
Boards: POST /boards, GET /boards, PATCH /boards/:id
Groups: POST /boards/:boardId/groups, DELETE /groups/:id
Items: POST /items, GET /items (with board/workspace filters)
Columns: Management of columnDefinitions
🎨 PHASE 7 — Frontend Core Features (Logyx UI)
Boards UI
Board list & Board view
Real-time updates via onSnapshot
Groups & Items
Table UI with inline editing
Drag & Drop (Items between groups)
Column System
Support: Text, Status (with global labels), Date, Person
📊 PHASE 8 — Dashboards (The "Logyx" Power)

Query:

/academies/{organizationId}/items
Filter by workspaceId, boardId, or assignees
Widgets
Status distribution (Pie/Bar)
Overdue items tracker
Workload by person
🔄 PHASE 9 — Permissions & Notifications
Board-level roles (Viewer/Editor/Admin)
Notifications for assignments & mentions
🧪 PHASE 10 — Testing & Rollout
Validate multi-tenancy security
Performance testing on flat item queries
Deploy backend -> Deploy Boards UI -> Release Dashboards
