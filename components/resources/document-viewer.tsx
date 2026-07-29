'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AlertCircle, CheckCircle2, FileText, Lightbulb } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CodeBlock } from '@/components/ai-elements/code-block';
import { parseJsonResponse } from '@/lib/generation/json-repair';
import type { StructuredDocument } from '@/lib/types/resource';
import { type BundledLanguage } from 'shiki';
import { type ComponentPropsWithoutRef, Component, type ReactNode } from 'react';

const SUPPORTED_LANGUAGES: Set<string> = new Set([
  'abap', 'actionscript-3', 'ada', 'angular-html', 'angular-ts',
  'apache', 'apex', 'apl', 'applescript', 'ara',
  'asciidoc', 'asm', 'astro', 'awk', 'ballerina',
  'bat', 'beancount', 'berry', 'bibtex', 'bicep',
  'blade', 'c', 'cadence', 'clarity', 'clojure',
  'cmake', 'cobol', 'codeowners', 'coffeescript', 'common-lisp',
  'coq', 'cpp', 'crystal', 'csharp', 'css',
  'csv', 'cue', 'cypher', 'd', 'dart',
  'dax', 'diff', 'docker', 'dream-maker', 'elixir',
  'elm', 'erb', 'erlang', 'fennel', 'fish',
  'fluent', 'fortran-fixed', 'fortran-free', 'fsharp', 'gdresource',
  'gdscript', 'gdshader', 'gherkin', 'git-commit', 'git-rebase',
  'gleam', 'glimmer-js', 'glimmer-ts', 'glsl', 'gnuplot',
  'go', 'graphql', 'groovy', 'hack', 'haml',
  'handlebars', 'haskell', 'hcl', 'hlsl', 'hoon',
  'html', 'http', 'imba', 'ini', 'java',
  'javascript', 'jinja', 'jison', 'json', 'json5',
  'jsonc', 'jsonl', 'jssm', 'jsx', 'julia',
  'kotlin', 'kusto', 'latex', 'less', 'liquid',
  'lisp', 'logo', 'lua', 'luau', 'make',
  'markdown', 'marko', 'matlab', 'mdc', 'mermaid',
  'mipsasm', 'mojo', 'move', 'narrat', 'nextflow',
  'nginx', 'nim', 'nix', 'nushell', 'objective-c',
  'objective-cpp', 'ocaml', 'pascal', 'perl', 'php',
  'plsql', 'postcss', 'powerquery', 'powershell', 'prisma',
  'prolog', 'proto', 'pug', 'puppet', 'purescript',
  'python', 'r', 'racket', 'raku', 'razor',
  'reg', 'rel', 'riscv', 'rst', 'ruby',
  'rust', 'sas', 'sass', 'scala', 'scheme',
  'scss', 'shaderlab', 'shellscript', 'shellsession', 'smalltalk',
  'solidity', 'soy', 'sparql', 'splunk', 'sql',
  'ssh-config', 'stata', 'stylus', 'svelte', 'swift',
  'system-verilog', 'talonscript', 'tasl', 'terraform', 'tex',
  'toml', 'tsx', 'turtle', 'twig', 'typescript',
  'typst', 'v', 'vala', 'vb', 'verilog',
  'vhdl', 'viml', 'vue', 'vue-html', 'vyper',
  'wasm', 'wenyan', 'wgsl', 'wolfram', 'xml',
  'xsl', 'yaml', 'zenscript', 'zig',
]);

function resolveLanguage(lang: string | undefined): BundledLanguage {
  if (!lang) return 'text' as BundledLanguage;
  const lower = lang.toLowerCase();
  if (SUPPORTED_LANGUAGES.has(lower)) return lower as BundledLanguage;
  const aliases: Record<string, string> = {
    js: 'javascript',
    ts: 'typescript',
    py: 'python',
    rb: 'ruby',
    sh: 'shellscript',
    bash: 'shellscript',
    zsh: 'shellscript',
    yml: 'yaml',
    md: 'markdown',
    csharp: 'csharp',
    cs: 'csharp',
    cpp: 'cpp',
    cc: 'cpp',
    cxx: 'cpp',
    hs: 'haskell',
    kt: 'kotlin',
    rs: 'rust',
    go: 'go',
    golang: 'go',
    dockerfile: 'docker',
    makefile: 'make',
  };
  const resolved = aliases[lower];
  if (resolved && SUPPORTED_LANGUAGES.has(resolved)) return resolved as BundledLanguage;
  return 'text' as BundledLanguage;
}

function CodeComponent({ className, children, ...props }: ComponentPropsWithoutRef<'code'>) {
  const match = /language-(\w+)/.exec(className || '');
  const code = String(children).replace(/\n$/, '');

  if (match) {
    const language = resolveLanguage(match[1]);
    return <CodeBlock code={code} language={language} />;
  }

  return (
    <code className={className} {...props}>
      {children}
    </code>
  );
}

type ErrorBoundaryProps = { children: ReactNode };
type ErrorBoundaryState = { hasError: boolean; error: Error | null };

class MarkdownErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-destructive">
          <p>Markdown 渲染失败</p>
          <pre className="text-xs">{this.state.error?.message}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

function looksLikeJson(content: string): boolean {
  const trimmed = content.trim();
  return trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed.startsWith('```json');
}

function parseStructuredDocument(content: string): StructuredDocument | null {
  if (!looksLikeJson(content)) {
    return null;
  }

  const parsed = parseJsonResponse<StructuredDocument>(content);
  if (parsed?.format === 'structured_document_v1' && Array.isArray(parsed.sections)) {
    return parsed;
  }
  return null;
}

function CalloutIcon({ tone }: { tone?: 'info' | 'warning' | 'success' }) {
  if (tone === 'warning') return <AlertCircle className="h-4 w-4 text-amber-500" />;
  if (tone === 'success') return <CheckCircle2 className="h-4 w-4 text-green-500" />;
  return <Lightbulb className="h-4 w-4 text-blue-500" />;
}

export function DocumentViewer({ content, title }: { content: string; title: string }) {
  const structured = parseStructuredDocument(content);

  if (!structured) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <MarkdownErrorBoundary>
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  pre: ({ children }) => <>{children}</>,
                  code: CodeComponent,
                }}
              >
                {content}
              </ReactMarkdown>
            </div>
          </MarkdownErrorBoundary>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {structured.introduction ? <p className="text-sm text-muted-foreground">{structured.introduction}</p> : null}
          {structured.outline.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {structured.outline.map((section) => (
                <Badge key={section.id} variant="outline" className="text-xs">
                  {section.title}
                </Badge>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {structured.sections.map((section, index) => (
        <Card key={`section-${index}`}>
          <CardHeader>
            <CardTitle className="text-lg">{section.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {section.blocks.map((block, blockIndex) => {
              if (block.type === 'code') {
                return (
                  <div key={`${section.id}-code-${blockIndex}`} className="space-y-2">
                    {block.title ? <h4 className="text-sm font-medium">{block.title}</h4> : null}
                    <CodeBlock code={block.content ?? ''} language={resolveLanguage(block.language)} />
                  </div>
                );
              }

              if (block.type === 'callout') {
                return (
                  <div
                    key={`${section.id}-callout-${blockIndex}`}
                    className="rounded-lg border bg-muted/40 p-4"
                  >
                    <div className="flex items-start gap-3">
                      <CalloutIcon tone={block.tone} />
                      <div className="space-y-1">
                        {block.title ? <p className="text-sm font-medium">{block.title}</p> : null}
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{block.content}</p>
                      </div>
                    </div>
                  </div>
                );
              }

              if (block.type === 'table') {
                return (
                  <div key={`${section.id}-table-${blockIndex}`} className="space-y-2 overflow-x-auto">
                    {block.title ? <h4 className="text-sm font-medium">{block.title}</h4> : null}
                    <table className="w-full border-collapse overflow-hidden rounded-lg border text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          {(block.headers ?? []).map((header) => (
                            <th key={header} className="border px-3 py-2 text-left font-medium">{header}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(block.rows ?? []).map((row, rowIndex) => (
                          <tr key={`${section.id}-row-${rowIndex}`}>
                            {row.map((cell, cellIndex) => (
                              <td key={`${section.id}-cell-${rowIndex}-${cellIndex}`} className="border px-3 py-2 text-muted-foreground">
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              }

              return (
                <div key={`${section.id}-text-${blockIndex}`} className="space-y-2">
                  {block.title ? <h4 className="text-sm font-medium">{block.title}</h4> : null}
                  <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-muted-foreground">
                    {block.content}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}

      {structured.summary ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">总结</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{structured.summary}</p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
