
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import * as logger from "firebase-functions/logger";

// In a managed Firebase/Google Cloud environment (like Cloud Functions), the SDK 
// automatically discovers the project configuration. `initializeApp()` without 
// arguments is the standard and most reliable way to initialize.
// This is idempotent and will only initialize the SDK once per function instance.
if (admin.apps.length === 0) {
  admin.initializeApp();
}

// In a Google Cloud Function environment, `process.env.GCLOUD_PROJECT` holds the 
// project ID. Since this project's Firestore database is custom-named with the
// same ID ('bemind-gym') instead of '(default)', we must explicitly pass this ID
// to getFirestore() to establish a connection.
const dbId = process.env.GCLOUD_PROJECT;

// A custom-named database is used, so the project ID is strictly required.
// This check ensures the function fails fast if the environment is misconfigured,
// preventing it from connecting to a wrong DB and resolving the TypeScript error.
if (!dbId) {
  const errorMessage = "CRITICAL: GCLOUD_PROJECT environment variable not set. Cannot connect to the named Firestore database.";
  logger.error(errorMessage);
  throw new Error(errorMessage);
}


logger.info(`Connecting to Firestore database with explicit ID: ${dbId}`);
export const db = getFirestore(admin.app(), dbId);
db.settings({ ignoreUndefinedProperties: true });
export const storage = getStorage();

// Define loose shapes for Firestore types to catch them before the recursive object check
interface FirestoreType {
    isEqual(other: any): boolean;
}

// This recursive type will convert any Firestore Timestamp/FieldValue properties to Date.
// We place the specific checks BEFORE the generic object check.
// We also handle 'any' explicitly to prevent issues.
type DeepWithDates<T> = 
    T extends Date ? Date :
    T extends FirestoreType ? Date :
    T extends (infer U)[] ? DeepWithDates<U>[] :
    T extends object ? { [K in keyof T]: DeepWithDates<T[K]> } :
    T;


// Helper to convert Firestore Timestamps to JS Date objects and include document ID
export const snapshotToData = <T extends object>(snapshot: admin.firestore.DocumentSnapshot): (DeepWithDates<T> & { id: string }) | null => {
  if (!snapshot.exists) {
    return null;
  }
  // Firestore's data() method doesn't include the id, so we add it manually.
  const documentData = snapshot.data() as T;

  const convertTimestamps = (obj: any): any => {
    if (obj instanceof admin.firestore.Timestamp) {
      return obj.toDate();
    }
    // Handle FieldValues (like serverTimestamp).
    // In a read context, this is rare, but if it happens, we treat it as 'now'.
    if (obj instanceof admin.firestore.FieldValue) {
        return new Date(); 
    }
    if (obj instanceof Date) {
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.map(convertTimestamps);
    }
    if (typeof obj === 'object' && obj !== null) {
      const newObj: { [key: string]: any } = {};
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          newObj[key] = convertTimestamps(obj[key]);
        }
      }
      return newObj;
    }
    return obj;
  };

  const processedData = convertTimestamps(documentData);
  
  return {
    ...processedData,
    id: snapshot.id, // Ensure the document ID is explicitly added here
  } as (DeepWithDates<T> & { id: string });
};

export const querySnapshotToArray = <T extends object>(querySnapshot: admin.firestore.QuerySnapshot): (DeepWithDates<T> & { id: string })[] => {
  return querySnapshot.docs.map(doc => snapshotToData<T>(doc)).filter(item => item !== null) as (DeepWithDates<T> & { id: string })[];
};
