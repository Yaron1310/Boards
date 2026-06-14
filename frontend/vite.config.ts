import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url'; // Import for ESM __dirname

// ESM-friendly way to get __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'), // Now __dirname is correctly defined
    },
  },
  server: {
    port: 5173, // You can specify the port Vite runs on
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      external: [
        'mammoth',
        'pdfjs-dist',
        'xlsx',
        '@codetrix-studio/capacitor-google-auth',
        // Fix 3: Capacitor is only needed in the native iOS/Android shell, not in the web build
        '@capacitor/core',
        '@capacitor/android',
        '@capacitor/ios',
      ],
      output: {
        // Group route components by the minimum role that needs them.
        //
        // IMPORTANT: use precise filename matching (trailing '.') so that only the
        // exact route-component file is assigned, not sub-components with similar
        // names or shared helpers in the same folder.
        //
        // Components that are imported by MULTIPLE chunks (AcademyBillingPage,
        // ThemeSettingsPage, AcademyHubPage, MainLayout, shared modals) are
        // intentionally NOT listed here — Rollup will auto-create shared chunks
        // for them, which is exactly what we want and avoids circular-chunk errors.
        manualChunks(id) {
          // ── SYSTEM_ADMIN only ───────────────────────────────────────────────
          if (
            id.includes('/components/admin/AcademyManagementPage.') ||
            id.includes('/components/admin/TokenLimitsPage.')        ||
            id.includes('/components/admin/TutorialSettingsPage.')   ||
            id.includes('/components/admin/SystemPaymentsPage.')
          ) {
            return 'chunk-system-admin';
          }

          // ── ACADEMY_ADMIN only (not needed by ORG_ADMIN) ───────────────────
          // AcademyBillingPage and ThemeSettingsPage are intentionally excluded:
          // AcademyHubPage (user-accessible) statically imports them, so forcing
          // them here would create a chunk-user → chunk-workspace-admin cycle.
          if (
            id.includes('/components/admin/OrganizationManagementPage.') ||
            id.includes('/components/admin/AiMentorWizard.')             ||
            id.includes('/components/admin/ChatSettingsPage.')            ||
            id.includes('/components/admin/CourseManagementPage.')        ||
            id.includes('/components/admin/BillingSettingsPage.')         ||
            id.includes('/components/admin/QuestionnaireManagementPage.') ||
            // Admin-only questionnaire sub-components live under questionnaire/admin/
            // They were previously caught by the broad '/components/questionnaire/'
            // user-chunk rule, which caused chunk-workspace-admin → chunk-user.
            id.includes('/components/questionnaire/admin/')
          ) {
            return 'chunk-workspace-admin';
          }

          // ── ORG_ADMIN + ACADEMY_ADMIN + SYSTEM_ADMIN ───────────────────────
          // Separate chunk so ORG_ADMIN never downloads the full workspace-admin bundle.
          if (
            id.includes('/components/admin/AdminDashboardPage.') ||
            id.includes('/components/admin/UserManagementPage.')
          ) {
            return 'chunk-org-admin';
          }

          // ── All authenticated users ─────────────────────────────────────────
          // Use '/questionnaire/user/' (not '/questionnaire/') so that the
          // admin sub-folder above is not accidentally pulled into this chunk.
          if (
            id.includes('/components/chat/')                    ||
            id.includes('/components/courses/')                 ||
            id.includes('/components/questionnaire/user/')      ||
            id.includes('/components/profile/')                 ||
            id.includes('/components/billing/')
          ) {
            return 'chunk-user';
          }
        },
      },
    },
  },
});
