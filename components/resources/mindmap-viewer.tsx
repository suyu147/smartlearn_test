'use client';

import { useEffect, useRef, useState } from 'react';
import { Markmap } from 'markmap-view';
import { Transformer } from 'markmap-lib';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const transformer = new Transformer();

export function MindmapViewer({ content, title }: { content: string; title: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const mmRef = useRef<Markmap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    let cancelled = false;

    const render = async () => {
      try {
        setLoading(true);
        setError(null);

        const { root } = transformer.transform(content);

        if (cancelled) return;

        if (!mmRef.current) {
          mmRef.current = Markmap.create(svgEl, { zoom: true, pan: true }, root);
        } else {
          await mmRef.current.setData(root);
          await mmRef.current.fit();
        }

        if (!cancelled) {
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : '渲染失败');
          setLoading(false);
        }
      }
    };

    render();

    return () => {
      cancelled = true;
    };
  }, [content]);

  useEffect(() => {
    return () => {
      if (mmRef.current) {
        mmRef.current.destroy();
        mmRef.current = null;
      }
    };
  }, []);

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border bg-muted/50 p-4">
            <pre className="text-sm whitespace-pre-wrap">{content}</pre>
          </div>
          <p className="mt-2 text-xs text-destructive">
            思维导图渲染失败：{error}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center min-h-[400px] bg-background/60">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          )}
          <svg
            ref={svgRef}
            className="w-full min-h-[400px]"
          />
        </div>
      </CardContent>
    </Card>
  );
}
