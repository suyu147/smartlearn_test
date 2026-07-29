/**
 * Tests for pgvector helper utilities.
 */

import { describe, it, expect } from 'vitest';
import { toVectorString, fromVectorString } from '../pgvector';

describe('pgvector helpers', () => {
  describe('toVectorString', () => {
    it('converts a simple array to pgvector format', () => {
      expect(toVectorString([0.1, 0.2, 0.3])).toBe('[0.1,0.2,0.3]');
    });

    it('handles single-element array', () => {
      expect(toVectorString([1.5])).toBe('[1.5]');
    });

    it('handles empty array', () => {
      expect(toVectorString([])).toBe('[]');
    });

    it('handles negative values', () => {
      expect(toVectorString([-0.5, 0.5, -1.0])).toBe('[-0.5,0.5,-1]');
    });

    it('handles high-dimensional vectors', () => {
      const vec = Array.from({ length: 1536 }, (_, i) => i * 0.001);
      const result = toVectorString(vec);
      expect(result.startsWith('[')).toBe(true);
      expect(result.endsWith(']')).toBe(true);
      expect(result.split(',').length).toBe(1536);
    });
  });

  describe('fromVectorString', () => {
    it('parses pgvector format back to number array', () => {
      expect(fromVectorString('[0.1,0.2,0.3]')).toEqual([0.1, 0.2, 0.3]);
    });

    it('handles empty vector string', () => {
      expect(fromVectorString('[]')).toEqual([]);
    });

    it('handles single element', () => {
      expect(fromVectorString('[1.5]')).toEqual([1.5]);
    });

    it('handles negative values', () => {
      expect(fromVectorString('[-0.5,0.5,-1]')).toEqual([-0.5, 0.5, -1]);
    });

    it('roundtrips with toVectorString', () => {
      const original = [0.123, -0.456, 0.789, 1.0, -1.0];
      expect(fromVectorString(toVectorString(original))).toEqual(original);
    });

    it('returns empty array for empty string input', () => {
      expect(fromVectorString('')).toEqual([]);
    });
  });
});
