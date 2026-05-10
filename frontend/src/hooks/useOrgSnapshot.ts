import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  collection,
  onSnapshot,
  type FirestoreError,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { firestoreDb, firebaseAuth } from '../firebase';

/**
 * Listens to the org's boardVersions collection (one tiny doc per board).
 * Any write to that collection means some board's data changed — invalidates
 * dashboard queries so the computed summary re-fetches from the server.
 *
 * Using boardVersions rather than the full items collection keeps the initial
 * read cost proportional to the number of boards, not the number of items.
 */
export function useOrgSnapshot(orgId: string | undefined): void {
  const qc = useQueryClient();

  useEffect(() => {
    if (!orgId) return;

    const handleError = (err: FirestoreError) => {
      console.warn('[useOrgSnapshot] Firestore error:', err.code, err.message);
    };

    let unsub: (() => void) | null = null;

    const openListener = () => {
      const boardVersionsRef = collection(firestoreDb, `organizations/${orgId}/boardVersions`);

      unsub = onSnapshot(boardVersionsRef, (snapshot) => {
        if (snapshot.docChanges().length === 0) return;
        void qc.invalidateQueries({ queryKey: ['dashboard'] });
      }, handleError);
    };

    const closeListener = () => { unsub?.(); unsub = null; };

    const unsubAuth = onAuthStateChanged(firebaseAuth, (firebaseUser) => {
      closeListener();
      if (firebaseUser) openListener();
    });

    return () => { unsubAuth(); closeListener(); };
  }, [orgId, qc]);
}
