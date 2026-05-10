import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  collection,
  query,
  where,
  onSnapshot,
  type DocumentSnapshot,
  type FirestoreError,
} from 'firebase/firestore';
import { firestoreDb } from '../firebase';
import { queryKeys } from './queries/queryKeys';
import type { Item, Group, PaginatedResponse } from '../types';

function docToItem(doc: DocumentSnapshot): Item {
  const d = doc.data()!;
  return {
    ...d,
    id: doc.id,
    createdAt:        d.createdAt?.toDate?.()?.toISOString()        ?? d.createdAt,
    updatedAt:        d.updatedAt?.toDate?.()?.toISOString()        ?? d.updatedAt,
    dueDate:          d.dueDate?.toDate?.()?.toISOString()          ?? d.dueDate,
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
  const boardIdRef = useRef(boardId);
  boardIdRef.current = boardId;

  useEffect(() => {
    if (!boardId || !orgId) return;

    const handleError = (err: FirestoreError) => {
      // Permission errors are expected before Firebase Auth resolves — suppress them.
      if (err.code !== 'permission-denied') {
        console.warn('[useBoardSnapshot]', err.code, err.message);
      }
    };

    // ── Items listener ────────────────────────────────────────────────────────
    const itemsRef = collection(firestoreDb, `organizations/${orgId}/items`);
    const itemsQuery = query(itemsRef, where('boardId', '==', boardId));

    const unsubItems = onSnapshot(itemsQuery, (snapshot) => {
      let hasStructuralChange = false;

      snapshot.docChanges().forEach((change) => {
        if (change.type === 'modified') {
          const item = docToItem(change.doc);

          // Patch the individual item cache — memo'd ItemRow components pick this up
          qc.setQueryData(queryKeys.items.one(item.id), item);

          // Patch any list caches that already contain this item
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
          // added or removed — require a full list reload to preserve ordering
          hasStructuralChange = true;
        }
      });

      if (hasStructuralChange) {
        void qc.invalidateQueries({ queryKey: ['items'] });
      }
    }, handleError);

    // ── Groups listener ───────────────────────────────────────────────────────
    const groupsRef = collection(firestoreDb, `organizations/${orgId}/boards/${boardId}/groups`);

    const unsubGroups = onSnapshot(groupsRef, (snapshot) => {
      if (snapshot.docChanges().length === 0) return;

      // For modified groups patch the cache; for added/removed invalidate
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

    return () => {
      unsubItems();
      unsubGroups();
    };
  }, [boardId, orgId, qc]);
}
