import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  collection,
  query,
  where,
  onSnapshot,
  type DocumentSnapshot,
  type FirestoreError,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { firestoreDb, firebaseAuth } from '../firebase';
import { queryKeys } from './queries/queryKeys';
import type { Item, Group, PaginatedResponse } from '../types';

function docToItem(doc: DocumentSnapshot): Item {
  const d = doc.data()!;
  return {
    ...d,
    id: doc.id,
    createdAt:         d.createdAt?.toDate?.()?.toISOString()         ?? d.createdAt,
    updatedAt:         d.updatedAt?.toDate?.()?.toISOString()         ?? d.updatedAt,
    dueDate:           d.dueDate?.toDate?.()?.toISOString()           ?? d.dueDate,
    chatLastMessageAt: d.chatLastMessageAt?.toDate?.()?.toISOString() ?? d.chatLastMessageAt,
  } as Item;
}

function docToGroup(doc: DocumentSnapshot): Group {
  const d = doc.data()!;
  return {
    ...d,
    id: doc.id,
    createdAt: d.createdAt?.toDate?.()?.toISOString() ?? d.createdAt,
    updatedAt: d.updatedAt?.toDate?.()?.toISOString() ?? d.updatedAt,
  } as Group;
}

export function useBoardSnapshot(boardId: string | undefined, orgId: string | undefined): void {
  const qc = useQueryClient();

  useEffect(() => {
    console.log('[useBoardSnapshot] effect — boardId:', boardId ?? 'undefined', '| orgId:', orgId ?? 'undefined');
    if (!boardId || !orgId) return;

    const handleError = (err: FirestoreError) => {
      console.warn('[useBoardSnapshot] Firestore error:', err.code, err.message);
    };

    let unsubItems: (() => void) | null = null;
    let unsubGroups: (() => void) | null = null;

    const openListeners = () => {
      console.log('[useBoardSnapshot] Opening Firestore listeners — boardId:', boardId, 'orgId:', orgId);
      // ── Items listener ──────────────────────────────────────────────────────
      const itemsQuery = query(
        collection(firestoreDb, `organizations/${orgId}/items`),
        where('boardId', '==', boardId),
      );

      unsubItems = onSnapshot(itemsQuery, (snapshot) => {
        console.log('[useBoardSnapshot] Items snapshot received —', snapshot.docChanges().length, 'change(s)');
        let hasStructuralChange = false;

        snapshot.docChanges().forEach((change) => {
          if (change.type === 'modified') {
            const item = docToItem(change.doc);

            qc.setQueryData(queryKeys.items.one(item.id), item);

            for (const [key, value] of qc.getQueriesData<PaginatedResponse<Item>>({ queryKey: ['items'] })) {
              if (!value || !('data' in value)) continue;
              const list = value as PaginatedResponse<Item>;
              if (list.data.some((i) => i.id === item.id)) {
                qc.setQueryData(key, {
                  ...list,
                  data: list.data.map((i) => (i.id === item.id ? item : i)),
                });
              }
            }
          } else {
            hasStructuralChange = true;
          }
        });

        if (hasStructuralChange) {
          void qc.invalidateQueries({ queryKey: ['items'] });
        }
      }, handleError);

      // ── Groups listener ─────────────────────────────────────────────────────
      const groupsRef = collection(firestoreDb, `organizations/${orgId}/boards/${boardId}/groups`);

      unsubGroups = onSnapshot(groupsRef, (snapshot) => {
        if (snapshot.docChanges().length === 0) return;
        let hasStructuralChange = false;

        snapshot.docChanges().forEach((change) => {
          if (change.type === 'modified') {
            const group = docToGroup(change.doc);
            qc.setQueryData<Group[]>(queryKeys.groups.all(boardId), (prev) =>
              prev ? prev.map((g) => (g.id === group.id ? group : g)) : prev,
            );
          } else {
            hasStructuralChange = true;
          }
        });

        if (hasStructuralChange) {
          void qc.invalidateQueries({ queryKey: queryKeys.groups.all(boardId) });
        }
      }, handleError);
    };

    const closeListeners = () => {
      unsubItems?.();
      unsubGroups?.();
      unsubItems = null;
      unsubGroups = null;
    };

    // Wait for Firebase Auth before opening Firestore listeners.
    // signInWithCustomToken is async — if we open listeners before it resolves,
    // request.auth is null, Firestore rules deny the read, and the listener
    // dies silently. onAuthStateChanged fires once auth is ready.
    const unsubAuth = onAuthStateChanged(firebaseAuth, (firebaseUser) => {
      console.log('[useBoardSnapshot] Auth state changed — uid:', firebaseUser?.uid ?? 'null (not signed in)');
      closeListeners();
      if (firebaseUser) openListeners();
    });

    return () => {
      unsubAuth();
      closeListeners();
    };
  }, [boardId, orgId, qc]);
}
