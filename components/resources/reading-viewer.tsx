'use client';

import { BookOpen, ExternalLink, ImageIcon, Link2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { StructuredReading } from '@/lib/types/resource';
import { parseJsonResponse } from '@/lib/generation/json-repair';

function looksLikeJson(content: string): boolean {
  const trimmed = content.trim();
  return trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed.startsWith('```json');
}

function parseStructuredReading(content: string): StructuredReading | null {
  if (!looksLikeJson(content)) {
    return null;
  }

  const parsed = parseJsonResponse<StructuredReading>(content);
  if (parsed?.format === 'structured_reading_v1' && Array.isArray(parsed.cards)) {
    return parsed;
  }
  return null;
}

export function ReadingViewer({ content, title }: { content: string; title: string }) {
  const structured = parseStructuredReading(content);

  if (!structured) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
            {content}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {structured.intro ? <p className="text-sm text-muted-foreground">{structured.intro}</p> : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {structured.cards.map((card) => (
          <Card key={card.id} className="overflow-hidden border-border/70">
            <div className="flex h-36 items-center justify-center bg-muted/40">
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <ImageIcon className="h-8 w-8" />
                <span className="text-xs">{card.coverPlaceholder || '封面图占位'}</span>
              </div>
            </div>
            <CardContent className="space-y-3 p-4">
              <div className="space-y-1">
                <h3 className="text-base font-semibold">{card.title}</h3>
                <p className="text-sm text-muted-foreground">{card.description}</p>
              </div>
              <div className="rounded-lg bg-primary/5 p-3 text-sm">
                <p className="font-medium text-primary">推荐理由</p>
                <p className="mt-1 text-muted-foreground">{card.reason}</p>
              </div>
              {card.suggestedUse ? (
                <div className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Badge variant="outline">阅读建议</Badge>
                  <span>{card.suggestedUse}</span>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Link2 className="h-4 w-4 text-primary" />
            外部参考链接
          </CardTitle>
        </CardHeader>
        <CardContent>
          {structured.externalLinks.length > 0 ? (
            <div className="space-y-3">
              {structured.externalLinks.map((link, index) => (
                <a
                  key={`${link.url}-${index}`}
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-start justify-between rounded-lg border p-3 transition-colors hover:bg-accent"
                >
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{link.title}</p>
                    <p className="text-xs text-muted-foreground break-all">{link.url}</p>
                    {link.note ? <p className="text-xs text-muted-foreground">{link.note}</p> : null}
                  </div>
                  <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                </a>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">当前没有额外外部参考链接。</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
