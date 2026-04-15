
import type { Request } from 'express';
import admin from 'firebase-admin';

const MAX_PAGE_SIZE = 200;
const DEFAULT_PAGE_SIZE = 50;

export interface PaginationParams {
    limit: number;
    cursor: string | undefined;
    search: string | undefined;
}

export interface PaginatedResult<T> {
    data: T[];
    cursor: string | null;
    hasMore: boolean;
    total?: number;
}

/**
 * Extract pagination parameters from the request query string.
 * Falls back to sensible defaults if not provided.
 */
export const parsePaginationParams = (req: Request): PaginationParams => {
    const rawLimit = parseInt(req.query.limit as string, 10);
    const limit = isNaN(rawLimit) ? DEFAULT_PAGE_SIZE : Math.min(Math.max(rawLimit, 1), MAX_PAGE_SIZE);
    const cursor = (req.query.cursor as string) || undefined;
    const search = (req.query.search as string)?.trim().toLowerCase() || undefined;
    return { limit, cursor, search };
};

/**
 * Apply cursor-based pagination to a Firestore query.
 * Returns the query with startAfter and limit applied.
 * We fetch limit + 1 to detect hasMore without an extra count query.
 */
export const applyPagination = async (
    query: admin.firestore.Query,
    collection: admin.firestore.CollectionReference,
    params: PaginationParams
): Promise<{ paginatedQuery: admin.firestore.Query; limit: number }> => {
    let paginatedQuery = query;

    if (params.cursor) {
        const startDoc = await collection.doc(params.cursor).get();
        if (startDoc.exists) {
            paginatedQuery = paginatedQuery.startAfter(startDoc);
        }
    }

    // Fetch one extra to detect hasMore
    paginatedQuery = paginatedQuery.limit(params.limit + 1);

    return { paginatedQuery, limit: params.limit };
};

/**
 * Build a PaginatedResult from a query snapshot, given the requested limit.
 */
export const buildPaginatedResult = <T extends { id: string }>(
    items: T[],
    limit: number
): PaginatedResult<T> => {
    const hasMore = items.length > limit;
    const data = hasMore ? items.slice(0, limit) : items;
    const cursor = hasMore && data.length > 0 ? data[data.length - 1].id : null;
    return { data, cursor, hasMore };
};
