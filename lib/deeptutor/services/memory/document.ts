/**
 * Document model — Structured markdown documents for L2/L3 memory layers.
 *
 * Each document contains sections with entries that have:
 * - Unique IDs (for edit/delete)
 * - Ref references (for traceability back to L1)
 * - String content (≤240 chars per fact)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Entry {
  id: string;        // m_<ULID> format
  section: string;   // Section name (e.g., "Learning Topics")
  text: string;      // ≤240 chars
  refs: string[];     // Source references (trace_id or surface_name)
}

export interface Section {
  name: string;
  entries: Entry[];
}

export interface Document {
  title: string;
  sections: Section[];
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const CHAT_SECTIONS = [
  'Learning Topics',
  'Difficulties',
  'Questions',
  'Preferences',
  'Progress',
  'Context',
] as const;

export function getChatSections(): string[] {
  return [...CHAT_SECTIONS];
}

// ---------------------------------------------------------------------------
// Serialize (Document → markdown)
// ---------------------------------------------------------------------------

export function serializeDocument(doc: Document): string {
  const lines: string[] = [];
  const footnotes: string[] = [];

  lines.push(`# ${doc.title}\n`);

  for (const section of doc.sections) {
    if (section.entries.length === 0) continue;

    lines.push(`## ${section.name}\n`);

    for (const entry of section.entries) {
      const refStr = entry.refs.length > 0 ? ` ${entry.refs.map((_, i) => `[^${entry.id}_${i}]`).join(' ')}` : '';
      const idComment = `<!--${entry.id}-->`;
      lines.push(`- ${entry.text}${refStr} ${idComment}`);
    }

    lines.push('');
  }

  // Footnotes
  for (const section of doc.sections) {
    for (const entry of section.entries) {
      for (let i = 0; i < entry.refs.length; i++) {
        footnotes.push(`[^${entry.id}_${i}]: ${entry.refs[i]}`);
      }
    }
  }

  if (footnotes.length > 0) {
    lines.push('');
    lines.push(...footnotes);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Deserialize (markdown → Document)
// ---------------------------------------------------------------------------

export function deserializeDocument(markdown: string, title: string): Document {
  const doc: Document = { title, sections: [] };
  const lines = markdown.split('\n');

  // Collect all footnotes: entry_id_index → ref
  const footnoteMap = new Map<string, string>();
  const footnoteRegex = /^\[\^(.+?)_(\d+)\]:\s*(.+)$/;

  for (const line of lines) {
    const fm = line.match(footnoteRegex);
    if (fm) {
      footnoteMap.set(`${fm[1]}_${fm[2]}`, fm[3]);
    }
  }

  let currentSection: Section | null = null;
  let currentTitle = '';

  for (const line of lines) {
    // Skip footnote lines at end
    if (footnoteRegex.test(line)) continue;

    // H1 heading
    if (line.startsWith('# ') && !line.startsWith('## ')) {
      currentTitle = line.replace(/^# /, '').trim();
      continue;
    }

    // H2 heading → new section
    if (line.startsWith('## ')) {
      if (currentSection) {
        doc.sections.push(currentSection);
      }
      currentSection = { name: line.replace(/^## /, '').trim(), entries: [] };
      continue;
    }

    // List item with entry
    const entryMatch = line.match(/^-\s+(.+?)\s+<!--(.+?)-->$/);
    if (entryMatch && currentSection) {
      const fullText = entryMatch[1].trim();
      const id = entryMatch[2].trim();

      // Extract refs from the text: [^id_0] [^id_1]
      const refs: string[] = [];
      const refRegex = /\[\^(.+?)_(\d+)\]/g;
      let refMatch: RegExpExecArray | null;
      let text = fullText;

      // Re-extract refs
      refRegex.lastIndex = 0;
      while ((refMatch = refRegex.exec(fullText)) !== null) {
        const key = `${refMatch[1]}_${refMatch[2]}`;
        const ref = footnoteMap.get(key);
        if (ref) {
          refs.push(ref);
        }
      }

      // Strip ref markers from text
      text = text.replace(/\s*\[\^.+?_\d+\]\s*/g, ' ').trim();

      currentSection.entries.push({
        id,
        section: currentSection.name,
        text: text.slice(0, 240),
        refs,
      });
    }
  }

  if (currentSection && currentSection.entries.length > 0) {
    doc.sections.push(currentSection);
  }

  // If no title was found, use the provided default
  if (!currentTitle) {
    doc.title = title;
  }

  return doc;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Add an entry to a document, creating the section if it doesn't exist.
 */
export function addEntry(doc: Document, entry: Entry): void {
  let section = doc.sections.find((s) => s.name === entry.section);
  if (!section) {
    section = { name: entry.section, entries: [] };
    doc.sections.push(section);
  }
  section.entries.push(entry);
}

/**
 * Edit an existing entry (find by ID).
 * Returns the old entry or null if not found.
 */
export function editEntry(doc: Document, entryId: string, newText: string, newRefs: string[]): Entry | null {
  for (const section of doc.sections) {
    const idx = section.entries.findIndex((e) => e.id === entryId);
    if (idx !== -1) {
      const old = section.entries[idx];
      section.entries[idx] = {
        ...old,
        text: newText.slice(0, 240),
        refs: newRefs,
      };
      return old;
    }
  }
  return null;
}

/**
 * Delete an entry by ID.
 * Returns the deleted entry or null if not found.
 */
export function deleteEntry(doc: Document, entryId: string): Entry | null {
  for (const section of doc.sections) {
    const idx = section.entries.findIndex((e) => e.id === entryId);
    if (idx !== -1) {
      const [deleted] = section.entries.splice(idx, 1);
      // Remove empty sections
      if (section.entries.length === 0) {
        const sectionIdx = doc.sections.indexOf(section);
        if (sectionIdx !== -1) {
          doc.sections.splice(sectionIdx, 1);
        }
      }
      return deleted;
    }
  }
  return null;
}

/**
 * Get all entry IDs in a document.
 */
export function getAllEntryIds(doc: Document): string[] {
  return doc.sections.flatMap((s) => s.entries.map((e) => e.id));
}

/**
 * Get all entries ordered by a custom sort function.
 */
export function getAllEntries(doc: Document): Entry[] {
  return doc.sections.flatMap((s) => s.entries);
}
