import type { ColumnVisibility } from '../types';

export const COLUMN_VISIBILITY_OPTIONS: { value: ColumnVisibility; label: string; desc: string }[] = [
  { value: 'org_admins',   label: 'Org admins only',        desc: 'Only organization admins can see this column' },
  { value: 'edit_members', label: 'Admins + edit members',  desc: 'Admins and members who can edit this board' },
  { value: 'org_users',    label: 'Any org user',           desc: 'Any member of the organization' },
  { value: 'view_users',   label: 'Any view user',          desc: 'Everyone, including public link viewers' },
];

export const DEFAULT_COLUMN_VISIBILITY: ColumnVisibility = 'view_users';
