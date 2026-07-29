'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Render a LaTeX math expression using KaTeX.
 *
 * - Inline mode: $...$
 * - Display mode: $$...$$
 *
 * Uses katex.renderToString for SSR compatibility.
 */
interface MathBlockProps {
  math: string;
  inline?: boolean;
  className?: string;
}

export function MathBlock({ math, inline = false, className }: MathBlockProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    import('katex').then((katex) => {
      try {
        const rendered = katex.default.renderToString(math, {
          displayMode: !inline,
          throwOnError: false,
          trust: true,
        });
        setHtml(rendered);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : '数学公式渲染错误');
      }
    });
  }, [math, inline]);

  if (error) {
    return (
      <span className={cn('text-red-500 dark:text-red-400', className)} title={error}>
        {inline ? `$${math}$` : `$$${math}$$`}
      </span>
    );
  }

  if (inline) {
    return (
      <span
        ref={ref}
        className={cn('align-middle', className)}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: "KaTeX output is safe"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  return (
    <div
      ref={ref}
      className={cn('my-3 overflow-x-auto text-center', className)}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: "KaTeX output is safe"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
