/*
 * Small helpers shared by the authoring pages. Owner: Rohith.
 */
import type { FileKind } from '@/common/eduTypes';

/** ISO datetime → value for <input type="datetime-local"> in the user's time zone. */
export function toLocalInput(iso?: string): string {
  if (!iso) {
    return '';
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return '';
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** <input type="datetime-local"> value → ISO datetime, or undefined when empty. */
export function fromLocalInput(value: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

export function formatDate(iso?: string): string {
  return iso ? new Date(iso).toLocaleString() : '—';
}

export function fileKindFromName(fileName: string): FileKind | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.py')) return 'PY';
  if (lower.endsWith('.ipynb')) return 'IPYNB';
  if (lower.endsWith('.docx')) return 'DOCX';
  return null;
}

export const FILE_KIND_LABEL: Record<FileKind, string> = { PY: 'Python (.py)', IPYNB: 'Notebook (.ipynb)', DOCX: 'Word (.docx)' };
