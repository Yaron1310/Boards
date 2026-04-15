# CLAUDE.md — Gymind Codebase Guide

Gymind is a multi-tenant AI-driven learning & development SaaS platform. It provides AI-powered chat mentors, digital courses, questionnaires, and personal insights, organized in a hierarchy: **System → Academies → Organizations → Users**.

---

## Repository Structure

```
Gymind/
├── backend/                        # Firebase Cloud Functions (Express.js API)
│   └── src/
│       ├── controllers/            # Request handlers (19 modules)
│       ├── routes/                 # Route definitions (18 route files)
│       ├── middleware/             # Express middleware (auth, apiKey, billing, path)
│       ├── services/               # Business logic (firestore, gemini, email, analytics)
│       ├── db/                     # Firestore database abstraction
│       ├── config/                 # Environment config & validation
│       ├── types/                  # TypeScript type definitions
│       ├── utils/                  # Utility functions
│       ├── index.ts                # Firebase Functions entry point
│       └── server.ts               # Express app setup
├── frontend/       # React frontend (Vite + Tailwind)
│   └── src/
│       ├── components/             # React UI components (see below)
│       ├── contexts/               # Global state via React Context
│       ├── hooks/                  # Custom React hooks
│       ├── services/               # Frontend service layer (Gemini API)
│       ├── types.ts                # Shared TypeScript interfaces
│       ├── App.tsx                 # Root router and route definitions
│       ├── main.tsx                # App entry point
│       ├── config.ts               # Runtime configuration
│       └── constants.ts            # App-wide constants (API URL, languages, models)
├── firebase.json                   # Firebase deployment config (hosting + functions)
├── capacitor.config.ts             # Capacitor mobile config
└── metadata.json                   # Project metadata
```

---

## Technology Stack

### Frontend
| Tool | Version | Purpose |
|------|---------|---------|
| React | 18.3.1 | UI framework |
| TypeScript | 5.4.5 | Type safety (strict mode) |
| Vite | 5.3.1 | Build tool and dev server |
| React Router DOM | 6.30.1 | Client-side routing |
| Tailwind CSS | 3.4.17 | Utility-first styling |
| Capacitor | 7.0.0 | iOS/Android mobile wrapper |
| ESLint | 8.57.1 | Linting |

### Backend
| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 20 | Runtime (Firebase Cloud Functions) |
| Express | 4.19.2 | HTTP framework |
| TypeScript | 5.x | Type safety (strict mode) |
| Firebase Firestore | Latest | NoSQL database |
| @google/genai | 1.10.0 | Gemini AI integration |
| Passport.js | 0.7.0 | OAuth middleware |
| jsonwebtoken | 9.0.2 | JWT authentication |
| bcryptjs | 3.0.2 | Password hashing |
| nodemailer | 7.0.5 | Email sending |
| sanitize-html | 2.13.0 | HTML input sanitization |

---

## Development Workflows

### Frontend

```bash
cd frontend
npm install
npm run dev          # Start dev server on http://localhost:5173
npm run build        # Production build to dist/
npm run lint         # Run ESLint (0 warnings allowed)
npm run preview      # Preview production build
npm run cap:sync     # Sync Capacitor native projects
npm run cap:open:android  # Open Android Studio
npm run cap:open:ios      # Open Xcode
```

### Backend

```bash
cd backend
npm install
npm run build        # TypeScript compile (cleans dist/ first)
npm run serve        # Build + start Firebase emulators (functions only)
npm run dev          # Watch mode + Firebase emulators
npm run deploy       # Deploy to Firebase (functions only)
npm run logs         # Stream Firebase function logs
```

### Full Deployment

```bash
firebase deploy      # Deploys both hosting (frontend) and functions (backend)
```
The `firebase.json` predeploy hooks automatically build both the frontend and backend before deployment.

---

## Environment Configuration

### Backend (`backend/.env`)

Copy from `backend/.env.example` and fill in values:

```env
# Required
GEMINI_API_KEY=          # Google Gemini API key
JWT_SECRET=              # JWT signing secret
GOOGLE_CLIENT_ID=        # Google OAuth 2.0 client ID
GOOGLE_CLIENT_SECRET=    # Google OAuth 2.0 client secret
GOOGLE_CALLBACK_URL=     # OAuth callback URL (e.g. /api/auth/google/callback)
FRONTEND_URL=            # Frontend URL for CORS and redirects

# Optional — Microsoft OAuth
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_CALLBACK_URL=

# Optional — Email (Nodemailer)
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
SMTP_FROM_NAME=
```

Environment is validated at startup in `backend/src/config/env.ts`. Missing required variables will throw.

### Frontend (`frontend/src/constants.ts`)

The backend URL is configured here. In development it points to a cloud function URL; in production it uses relative paths.

---

## Architecture & Key Conventions

### Multi-Tenant Hierarchy

```
System (global admins)
  └── Academies (academy admins)
        └── Organizations (org admins)
              └── Users
```

Access control is enforced in both:
- **Middleware**: `auth.middleware.ts` (JWT), `billing.middleware.ts` (subscription checks), `apiKey.middleware.ts`
- **Controllers**: Manual role checks within handlers

### Frontend Component Structure

```
components/
├── admin/          # Admin pages: user mgmt, academy, courses, billing, AI wizard
├── auth/           # Login, register, OAuth callbacks, protected routes
├── chat/           # Chat interface and session management
├── courses/        # Course list, detail, and lesson pages
├── questionnaire/  # User questionnaire flow
├── profile/        # User profile, subscription, personal insights
├── billing/        # Org billing management
├── public/         # Public-facing pages (landing, plans, checkout)
├── layout/         # MainLayout wrapper
├── common/         # Shared reusable components
└── legal/          # Legal / TOS pages
```

### State Management

React Context API (no Redux/Zustand):
- **`AuthContext`** (`contexts/AuthContext.tsx`) — User identity, auth tokens, login/logout
- **`DataContext`** (`contexts/DataContext.tsx`) — Global app data (users, orgs, courses, etc.)
- **`ChatSessionContext`** (`contexts/ChatSessionContext.tsx`) — Active chat session state

Access via custom hooks:
```typescript
import { useAuth } from '@/hooks/useAuth';
import { useData } from '@/hooks/useData';
```

### Path Aliases

Frontend uses `@/` as alias for `./src/`:
```typescript
import { SomeComponent } from '@/components/common/SomeComponent';
```

Configured in both `vite.config.ts` and `tsconfig.json`.

### Backend Request Flow

```
Request → path.middleware (normalize)
        → apiKey.middleware (optional)
        → auth.middleware (JWT verify)
        → billing.middleware (plan check)
        → router → controller → service → Firestore
```

### Full Round-Trip Rule for Persisted Fields

**Whenever a new field is added to a form that saves data, verify the complete chain:**

1. Frontend form state includes the field
2. Frontend sends the field in the API request
3. **Backend controller reads the field from `req.body`** ← commonly missed
4. **Backend writes the field to Firestore** ← commonly missed
5. Backend TypeScript type (`DBCourse`, `DBLesson`, etc.) includes the field

Firestore has no schema enforcement, so the backend controller is the gatekeeper — it explicitly picks which fields to persist. Anything not explicitly read from `req.body` in the controller is silently dropped, even if the frontend sends it correctly.

### Firestore Data Model (Key Collections)

| Collection | Purpose |
|------------|---------|
| `users` | User accounts |
| `organizations` | Workspaces within an academy |
| `academies` | Academy/school entities |
| `academySettings` | Per-academy configuration |
| `memberships` | User ↔ org/academy relationships |
| `chatPersonas` | AI mentor persona definitions |
| `conversations` | User-AI conversation history |
| `triggerPhrases` | Language-specific AI trigger phrases |
| `courses` | Digital course content |
| `lessons` | Individual lessons (related to courses) |
| `questionnaires` | Assessment questionnaires |
| `questions` / `answers` | Questionnaire items |
| `userQuestionnaireResults` | Completed questionnaire records |
| `userCourseProgress` | Course completion tracking |
| `personalInsights` | AI-extracted user insights |
| `tokenUsage` | Gemini token consumption tracking |
| `plans` | Subscription/access plan definitions |
| `userAccessStatus` | Per-user plan access state |
| `transactions` | Financial transactions |
| `systemSettings` | Global system-wide configuration |
| `appConfig` | App-level settings |

### AI Integration

The backend uses Google Gemini API via `@google/genai`:
- **Service**: `backend/src/services/gemini.service.ts`
- **Default models**: Gemini 2.5 Pro (primary), Gemini 2.5 Flash (fallback) — set in `config/env.ts`
- **Frontend service**: `frontend/src/services/geminiService.ts` (direct client-side calls for some features)

### Authentication Flow

1. **JWT**: Standard session tokens, signed with `JWT_SECRET`
2. **Google OAuth 2.0**: Passport strategy, callback at `/api/auth/google/callback`
3. **Microsoft OAuth**: Optional Passport strategy
4. **API Keys**: Alternative auth for service-to-service calls

### API Route Conventions

- All API routes are prefixed with `/api/` (configured in `firebase.json` rewrites)
- Public routes (no auth): `/api/auth/*`, `/api/public/*`, `/api/payments/*`, `/api/provision/*`
- Protected routes require `Authorization: Bearer <jwt>` header

---

## Testing

No test suite is currently implemented. There are no test files or test configuration files in the repository. When adding tests, Vitest is the recommended choice given the Vite-based frontend setup.

---

## Deployment

Deployment is fully managed by Firebase CLI:

```bash
firebase deploy          # Full deploy (hosting + functions)
firebase deploy --only functions   # Deploy backend only
firebase deploy --only hosting     # Deploy frontend only
```

**What happens on `firebase deploy`:**
1. Builds frontend: `npm --prefix frontend run build`
2. Builds backend: `npm --prefix backend run build`
3. Deploys frontend `dist/` to Firebase Hosting
4. Deploys backend Cloud Functions (Node.js 20 runtime)
5. Firebase Hosting rewrites `/api/**` to the Cloud Function

**Live URL**: `https://www.gymind.app`

---

## Code Style & Conventions

- **TypeScript**: Strict mode enforced in both frontend and backend (`"strict": true`)
- **Linting**: ESLint with TypeScript support; `--max-warnings 0` means zero warnings allowed
- **Imports**: Use `@/` path alias in frontend; relative paths in backend
- **File naming**: PascalCase for React components (`.tsx`), camelCase for everything else (`.ts`)
- **No test files exist yet**: Don't expect test infrastructure
- **Input sanitization**: Use `sanitize-html` for any user-provided HTML content in the backend
- **Accessibility (ARIA)**: Every interactive element added to the frontend MUST include appropriate ARIA attributes — `aria-label` on buttons/inputs that lack visible text labels, `aria-labelledby` where a heading describes a section, `role` where semantic HTML alone is insufficient. This is a hard requirement for every UI change, not optional.

---

## Common Pitfalls

1. **Environment variables** must be set before running the backend — startup will fail if required vars are missing
2. **Firebase emulators** are required for local backend development (not a plain `node` server)
3. **Capacitor** requires a production build before syncing to native platforms — don't run `cap sync` on a dev build
4. **Firestore** has no schema enforcement — be careful about field names and structure; check existing documents before adding new fields
5. **Token usage** is tracked per user and enforced by `billing.middleware.ts` — AI endpoints may fail if limits are exceeded
6. **ESLint is strict** — zero warnings allowed; fix all linting issues before committing
