/*
 * In-app clipboard: remembers hashes of text copied inside the app so pastes can be checked.
 * Owner: Seetharam. PROJECT_PLAN.md 6.1.
 *
 * Only FNV-1a hashes are kept, never the text. They live in memory and, per work session, in sessionStorage
 * (`edu.clip.<contextId>`), so a copy made before a reload still counts as in-app afterwards (G13).
 */

const MAX_ENTRIES = 50;
const STORAGE_PREFIX = 'edu.clip.';

let entries: string[] = [];
let scope: string | null = null;

/** Normalizes whitespace so a copy and its paste match even if line endings differ. */
export function normalizeClip(text: string): string {
  return text.replace(/\r\n/g, '\n').trim();
}

/** Fast non-cryptographic hash (FNV-1a), enough for matching copies to pastes. */
export function hashClip(text: string): string {
  let h = 0x811c9dc5;
  const s = normalizeClip(text);
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
}

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    // Storage can be disabled (privacy mode, sandboxed iframe); memory-only then.
    return null;
  }
}

function persist(): void {
  if (!scope) {
    return;
  }
  try {
    storage()?.setItem(STORAGE_PREFIX + scope, JSON.stringify(entries));
  } catch {
    // Quota or disabled storage: the in-memory list still works for this page.
  }
}

/**
 * Switches the registry to one work session and loads its saved hashes. Called by LockdownProvider on mount.
 * Pass null to go back to a memory-only registry.
 */
export function setRegistryScope(contextId: string | null): void {
  if (scope === contextId) {
    return;
  }
  scope = contextId;
  entries = [];
  if (!contextId) {
    return;
  }
  try {
    const raw = storage()?.getItem(STORAGE_PREFIX + contextId);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) {
      entries = parsed.filter((h): h is string => typeof h === 'string').slice(-MAX_ENTRIES);
    }
  } catch {
    entries = [];
  }
}

export function rememberCopy(text: string): void {
  if (!normalizeClip(text)) {
    return;
  }
  entries.push(hashClip(text));
  if (entries.length > MAX_ENTRIES) {
    entries.shift();
  }
  persist();
}

export function wasCopiedInApp(text: string): boolean {
  return entries.includes(hashClip(text));
}

/** Forgets every remembered copy (tests, and after submit). */
export function clearRegistry(): void {
  entries = [];
  if (scope) {
    try {
      storage()?.removeItem(STORAGE_PREFIX + scope);
    } catch {
      // Nothing to clean up when storage is unavailable.
    }
  }
}
