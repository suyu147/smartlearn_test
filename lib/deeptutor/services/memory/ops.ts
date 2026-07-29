/**
 * Ops — Atomic operations on Document entries.
 *
 * Inspired by DeepTutor Python's ops.py.
 * Validates entries before applying, rejects invalid inputs.
 */

import type { Entry, Document } from '@/lib/deeptutor/services/memory/document';
import {
  addEntry,
  editEntry,
  deleteEntry,
  getAllEntryIds,
} from '@/lib/deeptutor/services/memory/document';
import { isValidEntryId, isValidRef } from '@/lib/deeptutor/services/memory/ids';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DeleteReason = 'contradicted' | 'superseded' | 'stale' | 'low-signal';

export interface AddOp {
  op: 'add';
  section: string;
  text: string;
  refs: string[];
}

export interface EditOp {
  op: 'edit';
  targetId: string;
  newText: string;
  newRefs: string[];
}

export interface DeleteOp {
  op: 'delete';
  targetId: string;
  reason: DeleteReason;
}

export type Op = AddOp | EditOp | DeleteOp;

export interface OpResult {
  success: boolean;
  message: string;
  entry?: Entry; // The created/edited entry (add/edit only)
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface ValidationError {
  code: string;
  message: string;
}

/**
 * Validate a single operation.
 */
function validateOp(op: Op, existingIds: Set<string>, index: number): ValidationError | null {
  switch (op.op) {
    case 'add': {
      if (!op.text || op.text.length < 1) {
        return { code: 'EMPTY_TEXT', message: `AddOp[${index}]: text must be ≥1 char` };
      }
      if (op.text.length > 240) {
        return { code: 'TEXT_TOO_LONG', message: `AddOp[${index}]: text must be ≤240 chars` };
      }
      if (!op.section || op.section.length < 1) {
        return { code: 'EMPTY_SECTION', message: `AddOp[${index}]: section must be ≥1 char` };
      }
      if (op.section.length > 80) {
        return { code: 'SECTION_TOO_LONG', message: `AddOp[${index}]: section must be ≤80 chars` };
      }
      if (!op.refs || op.refs.length === 0) {
        return { code: 'NO_REFS', message: `AddOp[${index}]: at least 1 ref is required` };
      }
      for (const ref of op.refs) {
        if (!isValidRef(ref)) {
          return { code: 'INVALID_REF', message: `AddOp[${index}]: invalid ref "${ref}"` };
        }
      }
      break;
    }

    case 'edit': {
      if (!op.targetId || !isValidEntryId(op.targetId)) {
        return { code: 'INVALID_TARGET', message: `EditOp[${index}]: invalid targetId "${op.targetId}"` };
      }
      if (!existingIds.has(op.targetId)) {
        return { code: 'TARGET_NOT_FOUND', message: `EditOp[${index}]: entry "${op.targetId}" not found` };
      }
      if (!op.newText || op.newText.length < 1) {
        return { code: 'EMPTY_TEXT', message: `EditOp[${index}]: newText must be ≥1 char` };
      }
      if (op.newText.length > 240) {
        return { code: 'TEXT_TOO_LONG', message: `EditOp[${index}]: newText must be ≤240 chars` };
      }
      if (!op.newRefs || op.newRefs.length === 0) {
        return { code: 'NO_REFS', message: `EditOp[${index}]: at least 1 ref is required` };
      }
      for (const ref of op.newRefs) {
        if (!isValidRef(ref)) {
          return { code: 'INVALID_REF', message: `EditOp[${index}]: invalid ref "${ref}"` };
        }
      }
      break;
    }

    case 'delete': {
      if (!op.targetId || !isValidEntryId(op.targetId)) {
        return { code: 'INVALID_TARGET', message: `DeleteOp[${index}]: invalid targetId "${op.targetId}"` };
      }
      if (!existingIds.has(op.targetId)) {
        return { code: 'TARGET_NOT_FOUND', message: `DeleteOp[${index}]: entry "${op.targetId}" not found` };
      }
      const validReasons: DeleteReason[] = ['contradicted', 'superseded', 'stale', 'low-signal'];
      if (!validReasons.includes(op.reason)) {
        return { code: 'INVALID_REASON', message: `DeleteOp[${index}]: invalid reason "${op.reason}"` };
      }
      break;
    }
  }

  return null;
}

/**
 * Validate a batch of operations.
 *
 * Rules:
 * - Individual op validation
 * - No duplicate targetId across edit/delete ops in the same batch
 * - All targetIds must exist in the document
 *
 * Returns array of validation errors. Empty array = all valid.
 */
export function validateOps(ops: Op[], doc: Document): ValidationError[] {
  const errors: ValidationError[] = [];
  const existingIds = new Set(getAllEntryIds(doc));
  const seenTargets = new Set<string>();

  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];

    // Per-op validation
    const err = validateOp(op, existingIds, i);
    if (err) {
      errors.push(err);
      continue;
    }

    // Check for duplicate target in same batch
    if (op.op === 'edit' || op.op === 'delete') {
      const targetId = op.targetId;
      if (seenTargets.has(targetId)) {
        errors.push({
          code: 'DUPLICATE_TARGET',
          message: `Op[${i}]: entry "${targetId}" is targeted by multiple ops in the same batch`,
        });
      }
      seenTargets.add(targetId);
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

/**
 * Apply a batch of operations to a document.
 * Operations must be pre-validated or the results are undefined.
 * Returns OpResult[] with the same length as ops.
 */
export function applyOps(doc: Document, ops: Op[]): OpResult[] {
  const results: OpResult[] = [];

  for (const op of ops) {
    switch (op.op) {
      case 'add': {
        const entry: Entry = {
          id: '', // Will be filled by caller or consolidator
          section: op.section,
          text: op.text.slice(0, 240),
          refs: op.refs,
        };
        addEntry(doc, entry);
        results.push({ success: true, message: `Added entry to section "${op.section}"`, entry });
        break;
      }

      case 'edit': {
        const old = editEntry(doc, op.targetId, op.newText, op.newRefs);
        if (old) {
          results.push({ success: true, message: `Edited entry ${op.targetId}`, entry: { ...old, text: op.newText.slice(0, 240), refs: op.newRefs } });
        } else {
          results.push({ success: false, message: `Entry ${op.targetId} not found` });
        }
        break;
      }

      case 'delete': {
        const deleted = deleteEntry(doc, op.targetId);
        if (deleted) {
          results.push({ success: true, message: `Deleted entry ${op.targetId} (reason: ${op.reason})` });
        } else {
          results.push({ success: false, message: `Entry ${op.targetId} not found` });
        }
        break;
      }
    }
  }

  return results;
}
