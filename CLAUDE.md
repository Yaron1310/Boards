# CLAUDE.md — Logyx/Gymind Codebase Guide

Logyx is a multi-tenant, Monday.com-like SaaS platform for internal business management. It provides customizable boards, groups, items, and dashboards, organized in a hierarchy: **System → Organizations (Academies) → Workspaces (Organizations) → Users**.

---

## Repository Structure

```
Gymind/
├── backend/                        # Firebase Cloud Functions (Express.js API)
│   └── src/
│       ├── controllers/            # Request handlers (Boards, Items, Workspaces, Auth)
│       ├── routes/                 # Route definitions
│       ├── middleware/             # Express middleware (auth, billing, path, rateLimit)
│       ├── services/               # Business logic (firestore, email, audit)
│       ├── db/                     # Firestore database abstraction
│       ├── config/                 # Environment config & validation
│       ├── types/                  # TypeScript type definitions (Board, Item, Column)
│       ├── utils/                  # Utility functions (pagination, sanitizer)
│       ├── index.ts                # Firebase Functions entry point
│       └── server.ts               # Express app setup
├── frontend/       # React frontend (Vite + Tailwind)
│   └── src/
│       ├── components/             # React UI components (Boards, Dashboards, Admin)
│       ├── contexts/               # Global state via React Context (Auth, Data)
│       ├── hooks/                  # Custom React hooks
│       ├── services/               # Frontend service layer
│       ├── types.ts                # Shared TypeScript interfaces
│       ├── App.tsx                 # Root router and route definitions
│       ├── main.tsx                # App entry point
│       ├── config.ts               # Runtime configuration
│       └── constants.ts            # App-wide constants (API URL, languages)
├── firebase.json                   # Firebase deployment config (hosting + functions)
└── metadata.json                   # Project metadata
```

---

## Technology Stack

### Frontend
- **React 18.3.1** (Vite + TS)
- **Tailwind CSS 3.4.17**
- **React Router DOM 6.30.1**
- **TanStack Query (React Query)**
- **Capacitor 7.0.0** (Mobile wrapper)

### Backend
- **Node.js 20** (Firebase Cloud Functions)
- **Express 4.19.2**
- **Firebase Firestore**
- **Passport.js** (OAuth: Google/Microsoft)
- **Nodemailer** (Email)
- **Sanitize-html** (Input safety)

---

## Core Architecture & Hierarchy

### Multi-Tenant Model (UI vs Code Naming)
- **Organization** (Firestore: `organizations/{orgId}`) — The primary tenant/client entity. This is what the UI labels "Organization".
- **Workspace** (Firestore: `workspaces/{workspaceId}`, field `orgId` → parent org) — A department or project grouping within an Organization. This is what the UI labels "Workspace".
- **User** — Employees belonging to one or more Workspaces.

### JWT Payload
After login the JWT carries:
- `orgId` — the **organization** ID (top-level tenant). Used as the first argument to all work-management collection functions.
- `selectedWorkspaceId` — the **workspace** (department) the user is currently operating in. Used for workspace-scoped filtering.

Personal/default workspaces have `isPersonal: true` in Firestore. Boards must never be created in a personal workspace.

### Data Model (Flat Storage at Org Level)
All work-management data is stored flat under the organization document, **not** under workspace documents. This enables cross-workspace dashboard queries while keeping tenant isolation.

**Actual Firestore paths:**
```
/organizations/{orgId}/boards/{boardId}
/organizations/{orgId}/boards/{boardId}/groups/{groupId}
/organizations/{orgId}/boards/{boardId}/columns/{columnId}
/organizations/{orgId}/boards/{boardId}/members/{userId}
/organizations/{orgId}/items/{itemId}
/organizations/{orgId}/boardVersions/{boardId}
/organizations/{orgId}/notifications/{notificationId}
```

**Workspace scoping is done via fields**, not path nesting:
- `boards.workspaceId` — which workspace (department) owns this board.
- `items.workspaceId` — denormalized from its board for filtering.

**Item Schema:**
- `workspaceId`: Reference to the Workspace (department).
- `boardId`: Reference to the parent Board.
- `groupId`: Reference to the Group.
- `values`: A dynamic map `Record<string, any>` keyed by `columnId`.
- `assignees`, `status`, `dueDate`, `isArchived`: Top-level indexed fields for querying.

---

## Development Workflows

### Frontend
```bash
cd frontend
npm run dev          # Start dev server on http://localhost:5173
npm run lint         # Run ESLint (0 warnings allowed)
```

### Backend
```bash
cd backend
npm run build        # TypeScript compile
npm run serve        # Firebase emulators (functions only)
npm run dev          # Watch mode + Firebase emulators
```

---

## Architecture & Key Conventions

### Full Round-Trip Rule for Dynamic Fields
The `values` map on an Item is dynamic. When adding/modifying fields:
1. Ensure the frontend form state includes the new field.
2. Verify the backend controller explicitly reads the field from `req.body`.
3. Verify the backend writes the field to Firestore.
4. Update the TypeScript types (`DBItem`) to reflect valid value types.

### Accessibility (ARIA)
Every interactive element MUST include appropriate ARIA attributes (`aria-label`, `aria-labelledby`, `role`). This is a hard requirement for all UI changes.

### Security
- Users can only read/write items where `orgId` (organization) matches their membership.
- Column definitions are writable by admins only.
- Item writes must validate that the `workspaceId` and `boardId` belong to the same `orgId`.
- Boards cannot be created in personal/default workspaces (`isPersonal: true`).

---

## Common Pitfalls
1. **Collection Functions Take `orgId`**: All work-management collection functions (`boardsCollection`, `itemsCollection`, etc.) take the **organization ID** as their first argument — NOT the workspace ID. Passing a workspace ID here is a bug.
2. **Firestore Schema**: Since Firestore is schemaless, the backend controller is the gatekeeper. Always sanitize and explicitly pick fields from `req.body`.
3. **Flat Storage Querying**: When querying items for a dashboard, the collection is already scoped to `orgId`. Add a `workspaceId` field filter if you need department-level scope.
4. **ESLint**: Zero warnings are allowed. The project uses strict linting rules.
