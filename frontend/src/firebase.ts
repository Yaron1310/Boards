import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY as string,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID as string,
};

// The backend (firestore.service.ts) uses GCLOUD_PROJECT (= the Firebase project ID)
// as the Firestore database ID. We mirror that here so both sides talk to the same DB.
const firestoreDbId = (import.meta.env.VITE_FIREBASE_DATABASE_ID as string | undefined) ?? firebaseConfig.projectId;

console.log('[Firebase] Initialising with projectId:', firebaseConfig.projectId ?? '⚠️ MISSING', '| firestoreDbId:', firestoreDbId ?? '⚠️ MISSING');

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

export const firebaseAuth = getAuth(app);

// Uses VITE_FIREBASE_DATABASE_ID if set, otherwise falls back to the project ID
// (which matches the backend's GCLOUD_PROJECT-based database selection).
export const firestoreDb = getFirestore(app, firestoreDbId);
