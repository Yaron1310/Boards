import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  type DocumentSnapshot,
  type FirestoreError,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { firestoreDb, firebaseAuth } from '../firebase';
import { queryKeys } from './queries/queryKeys';
import type { ChatMessage } from '../types';

function docToChatMessage(doc: DocumentSnapshot): ChatMessage {
  const d = doc.data()!;
  return {
    ...d,
    id: doc.id,
    createdAt: d.createdAt?.toDate?.()?.toISOString() ?? d.createdAt,
  } as ChatMessage;
}

export function useChatSnapshot(itemId: string | undefined, orgId: string | undefined): void {
  const qc = useQueryClient();

  useEffect(() => {
    if (!itemId || !orgId) return;

    const handleError = (err: FirestoreError) => {
      console.warn('[useChatSnapshot] Firestore error:', err.code, err.message);
    };

    let unsub: (() => void) | null = null;

    const openListener = () => {
      const messagesQuery = query(
        collection(firestoreDb, `organizations/${orgId}/items/${itemId}/chatMessages`),
        orderBy('createdAt', 'asc'),
      );

      unsub = onSnapshot(messagesQuery, (snapshot) => {
        // Set the full sorted list directly — snapshot always reflects current truth
        qc.setQueryData(queryKeys.chat.messages(itemId), snapshot.docs.map(docToChatMessage));
      }, handleError);
    };

    const closeListener = () => { unsub?.(); unsub = null; };

    const unsubAuth = onAuthStateChanged(firebaseAuth, (firebaseUser) => {
      closeListener();
      if (firebaseUser) openListener();
    });

    return () => { unsubAuth(); closeListener(); };
  }, [itemId, orgId, qc]);
}
