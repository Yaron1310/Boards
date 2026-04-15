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
To preserve the shell while pivoting, the following mapping is used in the UI:
- **Organization** (Code: `Academy` / `academyId`) — The primary tenant/client entity.
- **Workspace** (Code: `Organization` / `orgId`) — A department or project grouping within an Organization.
- **User** — Employees belonging to one or more Workspaces.

### Data Model (Flat Item Storage)
Items are stored in a flat collection at the Organization level to allow cross-board dashboard queries:
- **Collection Path**: `/academies/{academyId}/items/{itemId}`
- **Item Schema**: 
    - `orgId`: Reference to the Workspace.
    - `boardId`: Reference to the parent Board.
    - `groupId`: Reference to the Group.
    - `values`: A dynamic map `Record<string, any>` keyed by `columnId`.
    - `assignees`, `status`, `dueDate`, `isArchived`: Top-level indexed fields for querying.

### Supporting Collections
- `/academies/{academyId}/boards/{boardId}`
- `/academies/{academyId}/boards/{boardId}/groups/{groupId}`
- `/academies/{academyId}/columns/{columnId}` (Column definitions)

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
- Users can only read/write items where `academyId` matches their membership.
- Column definitions are writable by admins only.
- Item writes must validate that the `orgId` and `boardId` belong to the same `academyId`.

---

## Common Pitfalls
1. **Naming Confusion**: Remember that "Academy" in the database/code refers to the "Organization" in the UI, and "Organization" in code refers to "Workspace" in the UI.
2. **Firestore Schema**: Since Firestore is schemaless, the backend controller is the gatekeeper. Always sanitize and explicitly pick fields from `req.body`.
3. **Flat Storage Querying**: When querying items for a dashboard, always filter by `academyId` first to ensure tenant isolation.
4. **ESLint**: Zero warnings are allowed. The project uses strict linting rules.
