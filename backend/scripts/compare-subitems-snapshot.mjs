#!/usr/bin/env node
/**
 * Read-only report: subitems as they were at a past moment (Firestore point-in-time recovery)
 * compared with now. Nothing is restored or written to the database.
 *
 *   cd backend
 *   node scripts/compare-subitems-snapshot.mjs --at "2026-10-14T15:00:00Z" --csv subitems-compare.csv
 *
 * For every subitem table that existed at --at, and every subitem in it, the status now:
 *   OK               still in the same table
 *   ORPHANED         the row still exists but its table was deleted (what the teardown bug did)
 *   MOVED            the row is now in a different subitem table
 *   DELETED          the row no longer exists at all
 *   ARCHIVED / UNARCHIVED, RENAMED   reported alongside
 * plus, per table: whether it still exists, the parent's current table(s), and which of the
 * table's column definitions are gone. Subitem tables created after --at are listed as NEW.
 *
 * Options: --at <ISO time> (required; after the database's earliestVersionTime, rounded down to the
 *          minute), --csv <file> (one row per subitem, Excel-friendly), --out <file> (JSON),
 *          --board "<name or id>", --org <orgId>, --project <id>, --database <id>.
 * Needs PITR enabled and Firestore read access (gcloud auth application-default login).
 */
import fs from 'node:fs';
import admin from 'firebase-admin';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const args = process.argv.slice(2);
const opts = {};
for (let i = 0; i < args.length; i++) {
  const key = args[i].replace(/^--/, '');
  const next = args[i + 1];
  if (next === undefined || next.startsWith('--')) opts[key] = true;
  else { opts[key] = next; i++; }
}
if (!opts.at || opts.at === true) {
  console.error('Usage: node scripts/compare-subitems-snapshot.mjs --at "<ISO time>" [--csv file.csv] [--out file.json] [--board "<name or id>"]');
  process.exit(1);
}
const PROJECT = opts.project ?? 'boards-f313e';
const DATABASE = opts.database ?? PROJECT;
const atMs = Date.parse(opts.at);
if (isNaN(atMs)) { console.error(`--at: not a date/time: ${opts.at}`); process.exit(1); }
const readTime = Timestamp.fromMillis(Math.floor(atMs / 60_000) * 60_000);

admin.initializeApp({ projectId: PROJECT });
const db = getFirestore(admin.app(), DATABASE);
const orgDoc = (orgId) => db.collection('organizations').doc(orgId);

/** Reads a doc/query either now or as of the snapshot. */
const readAt = (refOrQuery, past) => (past
  ? db.runTransaction((tx) => tx.get(refOrQuery), { readOnly: true, readTime })
  : refOrQuery.get());

/** Every subitem table on a board, with its parent, rows and columns — at one moment. */
async function readBoardSubitems(orgId, boardRef, past) {
  const groups = (await readAt(boardRef.collection('groups'), past)).docs;
  const tables = new Map();
  for (const g of groups) {
    const data = g.data();
    if (!data.parentItemId) continue;
    const rows = (await readAt(orgDoc(orgId).collection('items').where('groupId', '==', g.id), past)).docs
      .map((d) => ({ id: d.id, name: d.data().name, isArchived: !!d.data().isArchived, order: d.data().order ?? 0 }))
      .sort((a, b) => a.order - b.order);
    const columns = (await readAt(boardRef.collection('columns').where('parentGroupId', '==', g.id), past)).docs
      .map((d) => ({ id: d.id, name: d.data().name, type: d.data().type }));
    tables.set(g.id, { tableId: g.id, parentItemId: data.parentItemId, rows, columns });
  }
  return tables;
}

async function main() {
  console.log(`Comparing subitems as of ${readTime.toDate().toISOString()} with now (read-only).`);
  const orgIds = opts.org ? [opts.org] : (await db.collection('organizations').select().get()).docs.map((d) => d.id);

  const tableReports = [];
  const csvRows = [];
  const counts = { OK: 0, ORPHANED: 0, MOVED: 0, DELETED: 0 };
  let newTables = 0;

  for (const orgId of orgIds) {
    const boardsThen = (await readAt(orgDoc(orgId).collection('boards'), true)).docs
      .filter((b) => opts.board === undefined || b.id === opts.board || b.data().name === opts.board);
    for (const b of boardsThen) {
      const boardName = b.data().name ?? b.id;
      const then = await readBoardSubitems(orgId, b.ref, true);
      const now = await readBoardSubitems(orgId, b.ref, false);
      if (then.size === 0 && now.size === 0) continue;

      // Where every subitem row lives now, and which tables each parent has now.
      const rowTableNow = new Map();
      for (const t of now.values()) for (const r of t.rows) rowTableNow.set(r.id, t.tableId);
      const tablesByParentNow = new Map();
      for (const t of now.values()) tablesByParentNow.set(t.parentItemId, [...(tablesByParentNow.get(t.parentItemId) ?? []), t]);

      const parentName = new Map();
      const nameOf = async (itemId) => {
        if (!parentName.has(itemId)) {
          const d = await orgDoc(orgId).collection('items').doc(itemId).get();
          const p = d.exists ? null : await readAt(orgDoc(orgId).collection('items').doc(itemId), true);
          parentName.set(itemId, d.exists ? d.data().name : p?.exists ? `${p.data().name} (parent deleted since)` : '(unknown parent)');
        }
        return parentName.get(itemId);
      };

      for (const t of then.values()) {
        const parent = await nameOf(t.parentItemId);
        const tableNow = now.get(t.tableId);
        const parentTablesNow = (tablesByParentNow.get(t.parentItemId) ?? []).map((x) => x.tableId);
        const missingColumns = tableNow ? t.columns.filter((c) => !tableNow.columns.some((n) => n.id === c.id)) : t.columns;
        const rowReports = [];
        for (const r of t.rows) {
          let status;
          let nowTable = rowTableNow.get(r.id) ?? null;
          let nowRow = nowTable ? now.get(nowTable).rows.find((x) => x.id === r.id) : null;
          if (nowTable === t.tableId) status = 'OK';
          else if (nowTable) status = 'MOVED';
          else {
            const d = await orgDoc(orgId).collection('items').doc(r.id).get();
            if (!d.exists) status = 'DELETED';
            else {
              status = 'ORPHANED';
              nowRow = { name: d.data().name, isArchived: !!d.data().isArchived };
              nowTable = d.data().groupId;
            }
          }
          counts[status]++;
          const notes = [];
          if (nowRow && nowRow.isArchived !== r.isArchived) notes.push(nowRow.isArchived ? 'ARCHIVED since' : 'UNARCHIVED since');
          if (nowRow && nowRow.name !== r.name) notes.push(`RENAMED to "${nowRow.name}"`);
          rowReports.push({ subitemId: r.id, name: r.name, archivedThen: r.isArchived, status, nowInTable: nowTable, notes });
          csvRows.push([boardName, parent, r.name, status, notes.join('; '), r.isArchived ? 'yes' : 'no',
            tableNow ? 'yes' : 'no', t.rows.length, b.id, t.parentItemId, t.tableId, nowTable ?? '', r.id]);
        }
        if (t.rows.length === 0) {
          csvRows.push([boardName, parent, '(empty table)', tableNow ? 'OK' : 'TABLE DELETED', '', '', tableNow ? 'yes' : 'no', 0,
            b.id, t.parentItemId, t.tableId, '', '']);
        }
        tableReports.push({
          orgId, boardId: b.id, boardName, parentItemId: t.parentItemId, parentItemName: parent,
          tableId: t.tableId, tableExistsNow: !!tableNow, parentTablesNow, missingColumns, rows: rowReports,
        });
      }
      for (const t of now.values()) {
        if (then.has(t.tableId)) continue;
        newTables++;
        const parent = await nameOf(t.parentItemId);
        tableReports.push({
          orgId, boardId: b.id, boardName, parentItemId: t.parentItemId, parentItemName: parent,
          tableId: t.tableId, isNew: true, rows: t.rows.map((r) => ({ subitemId: r.id, name: r.name, status: 'NEW' })),
        });
        for (const r of t.rows) {
          csvRows.push([boardName, parent, r.name, 'NEW', 'table created after the snapshot', '', 'yes', t.rows.length,
            b.id, t.parentItemId, t.tableId, t.tableId, r.id]);
        }
        if (t.rows.length === 0) {
          csvRows.push([boardName, parent, '(empty table)', 'NEW', 'table created after the snapshot', '', 'yes', 0,
            b.id, t.parentItemId, t.tableId, t.tableId, '']);
        }
      }
    }
  }

  // Console: only what changed.
  tableReports.sort((a, b) => `${a.boardName}/${a.parentItemName}`.localeCompare(`${b.boardName}/${b.parentItemName}`));
  for (const t of tableReports) {
    const changed = t.isNew || !t.tableExistsNow || t.rows.some((r) => r.status !== 'OK' || r.notes?.length);
    if (!changed) continue;
    const head = t.isNew ? 'NEW TABLE' : t.tableExistsNow ? 'TABLE STILL EXISTS' : 'TABLE DELETED';
    console.log(`\n[${head}] ${t.boardName} › ${t.parentItemName}  (table ${t.tableId})`);
    if (!t.isNew && !t.tableExistsNow) {
      console.log(`   parent's subitem tables now: ${t.parentTablesNow.length ? t.parentTablesNow.join(', ') : 'none'}`);
      if (t.missingColumns.length) console.log(`   columns gone: ${t.missingColumns.map((c) => `${c.name} [${c.type}]`).join(', ')}`);
    }
    for (const r of t.rows) console.log(`   - ${r.name}: ${r.status}${r.notes?.length ? ` (${r.notes.join('; ')})` : ''}`);
  }
  const totalThen = counts.OK + counts.ORPHANED + counts.MOVED + counts.DELETED;
  console.log(`\nAt the snapshot: ${tableReports.filter((t) => !t.isNew).length} subitem tables, ${totalThen} subitems.`);
  console.log(`Now: ${counts.OK} OK, ${counts.ORPHANED} ORPHANED, ${counts.MOVED} MOVED, ${counts.DELETED} DELETED; ${tableReports.filter((t) => !t.isNew && !t.tableExistsNow).length} tables deleted; ${newTables} new tables.`);

  if (opts.csv) {
    const cell = (v) => {
      const text = v === null || v === undefined ? '' : String(v);
      return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const header = ['Board', 'Parent item', 'Subitem', 'Status now', 'Notes', 'Archived at snapshot', 'Table exists now',
      'Subitems in table at snapshot', 'Board ID', 'Parent item ID', 'Table ID at snapshot', 'Table ID now', 'Subitem ID'];
    const order = { DELETED: 0, ORPHANED: 1, 'TABLE DELETED': 1, MOVED: 2, NEW: 3, OK: 4 };
    csvRows.sort((a, b) => (order[a[3]] ?? 9) - (order[b[3]] ?? 9) || `${a[0]}/${a[1]}`.localeCompare(`${b[0]}/${b[1]}`));
    fs.writeFileSync(opts.csv, '﻿' + [header, ...csvRows].map((l) => l.map(cell).join(',')).join('\r\n') + '\r\n', 'utf8');
    console.log(`CSV written to ${opts.csv} (${csvRows.length} rows; problems first).`);
  }
  if (opts.out) {
    fs.writeFileSync(opts.out, JSON.stringify({ snapshot: readTime.toDate().toISOString(), counts, tables: tableReports }, null, 2));
    console.log(`JSON written to ${opts.out}`);
  }
}

await main();
process.exit(0);
