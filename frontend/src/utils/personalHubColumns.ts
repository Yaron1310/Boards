import type { PersonalColumn, TemplateColumnShowIn } from '../types';

export type HubSection = 'today' | 'hub';

/**
 * Whether a cross-group personal column appears in the given Personal Hub section. Only columns
 * copied from the org template can be limited to one section (the admin's "Show in" setting, read
 * live from the template so changing it applies to every user's existing copy). Everything else —
 * and template columns with no setting — shows in both.
 */
export function columnShowsIn(
  col: Pick<PersonalColumn, 'templateColumnId'>,
  showInByTemplateId: ReadonlyMap<string, TemplateColumnShowIn>,
  section: HubSection,
): boolean {
  const showIn = (col.templateColumnId && showInByTemplateId.get(col.templateColumnId)) || 'both';
  return showIn === 'both' || showIn === section;
}
