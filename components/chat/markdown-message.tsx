'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { CodeBlock, CodeBlockCopyButton } from '@/components/ai-elements/code-block';
import { CalloutBlock, parseCalloutType } from '@/components/chat/callout-block';
import { MathBlock } from '@/components/chat/math-block';
import { cn } from '@/lib/utils';
import { type BundledLanguage } from 'shiki';
import { type ComponentPropsWithoutRef, type ReactNode, useEffect, useRef, useState, useMemo } from 'react';
import { Eye, Code2, ZoomIn, X } from 'lucide-react';

// KaTeX CSS — loaded once per page
import 'katex/dist/katex.min.css';

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

const LANGUAGE_LABELS: Record<string, string> = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  python: 'Python',
  rust: 'Rust',
  go: 'Go',
  java: 'Java',
  cpp: 'C++',
  c: 'C',
  html: 'HTML',
  css: 'CSS',
  sql: 'SQL',
  shellscript: 'Shell',
  json: 'JSON',
  yaml: 'YAML',
  markdown: 'Markdown',
  jsx: 'JSX',
  tsx: 'TSX',
};

/**
 * Convert LaTeX math delimiters to remark-math compatible format.
 * remark-math supports $...$ (inline) and $$...$$ (display) by default,
 * but many LLMs output \[...\] and \(...\) instead.
 *
 * Strategy:
 *   \[ ... \] → $$ ... $$  (display math)
 *   \( ... \) → $ ... $    (inline math)
 */
function preprocessMathDelimiters(text: string): string {
  // Display math: \[ ... \] → $$ ... $$
  text = text.replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => `$$ ${math.trim()} $$`);
  // Inline math: \( ... \) → $ ... $
  text = text.replace(/\\\(([\s\S]*?)\\\)/g, (_, math) => `$${math.trim()}$`);
  return text;
}

/** Enhanced code block with optional visualization rendering */
function CodeComponent({ className, children, ...props }: ComponentPropsWithoutRef<'code'>) {
  const match = /language-(\w+)/.exec(className || '');
  const code = String(children).replace(/\n$/, '');

  if (match) {
    const lang = resolveLanguage(match[1]);
    const label = LANGUAGE_LABELS[match[1]] ?? match[1];

    return (
      <div className="my-3 min-w-0 max-w-full overflow-hidden rounded-lg border">
        {/* Language label + copy button */}
        <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-1.5">
          <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
          <CodeBlockCopyButton className="h-5 w-5 text-muted-foreground hover:text-foreground" />
        </div>
        <CodeBlock code={code} language={lang} className="border-0 rounded-none" />
      </div>
    );
  }

  return (
    <code className="rounded bg-muted/60 px-1 py-0.5 text-[0.9em] font-mono" {...props}>
      {children}
    </code>
  );
}

/** Visualization-aware code block — delegates to renderer or falls back to CodeComponent */
function CodeComponentWithViz({ renderMode, ...props }: ComponentPropsWithoutRef<'code'> & { renderMode?: string }) {
  const match = /language-(\w+)/.exec(props.className || '');
  const code = String(props.children).replace(/\n$/, '');

  if (match && renderMode) {
    const language = match[1].toLowerCase();

    if (language === 'svg' && renderMode === 'svg') {
      return <SvgRenderer code={code} />;
    }

    if (language === 'mermaid' && renderMode === 'mermaid') {
      return <MermaidRenderer code={code} />;
    }

    if (language === 'html' && (renderMode === 'html' || renderMode === 'chartjs')) {
      return <HtmlIframeRenderer code={code} format={renderMode} />;
    }
  }

  return <CodeComponent {...props} />;
}

/** Styled table with alternating rows */
function TableComponent({ children, ...props }: ComponentPropsWithoutRef<'table'>) {
  return (
    <div className="my-3 overflow-x-auto rounded-lg border">
      <table className="w-full text-sm" {...props}>
        {children}
      </table>
    </div>
  );
}

function TheadComponent({ children, ...props }: ComponentPropsWithoutRef<'thead'>) {
  return (
    <thead className="bg-muted/50" {...props}>
      {children}
    </thead>
  );
}

function ThComponent({ children, ...props }: ComponentPropsWithoutRef<'th'>) {
  return (
    <th className="border-b px-3 py-2 text-left text-xs font-semibold text-muted-foreground" {...props}>
      {children}
    </th>
  );
}

function TdComponent({ children, ...props }: ComponentPropsWithoutRef<'td'>) {
  return (
    <td className="border-b px-3 py-2 text-sm" {...props}>
      {children}
    </td>
  );
}

function TrComponent({ children, ...props }: ComponentPropsWithoutRef<'tr'>) {
  return (
    <tr className="even:bg-muted/20" {...props}>
      {children}
    </tr>
  );
}

/**
 * Detect GitHub-style callout blocks in blockquotes.
 *
 * Format:
 *   > [!NOTE]
 *   > This is a note
 *   > with multiple lines
 *
 * The remark parser turns this into:
 *   blockquote > paragraph > [strong "[!NOTE]", text " This is a note"]
 */
function BlockquoteComponent({ children, ...props }: ComponentPropsWithoutRef<'blockquote'>) {
  // Try to detect callout pattern from children
  // React children are opaque, so we use a simpler approach:
  // check the rendered text content for [!TYPE] pattern
  return (
    <blockquote
      className="my-3 border-l-4 border-muted-foreground/20 pl-4 italic text-muted-foreground"
      {...props}
    >
      {children}
    </blockquote>
  );
}

// ---------------------------------------------------------------------------
// Zoom overlay — fullscreen lightbox for visualization preview
// ---------------------------------------------------------------------------

function VisualizationZoomOverlay({
  children,
  onClose,
  title,
}: {
  children: ReactNode;
  onClose: () => void;
  title: string;
}) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <span className="text-[13px] font-medium text-white/80">{title}</span>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
        >
          <X className="h-4 w-4 text-white/70" />
        </button>
      </div>
      <div
        className="flex-1 overflow-auto p-6 flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="max-w-[90vw] max-h-[85vh] overflow-auto">
          {children}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Visualization renderers — SVG inline, Mermaid, HTML iframe
// ---------------------------------------------------------------------------

/** Inline SVG renderer */
function SvgRenderer({ code }: { code: string }) {
  const [zoomed, setZoomed] = useState(false);

  return (
    <>
      <div className="my-3 rounded-lg border bg-white dark:bg-[#1e1e2e] overflow-hidden">
        <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-1.5">
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <Eye className="h-3 w-3" />
            SVG 预览
          </span>
          <button
            onClick={() => setZoomed(true)}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <ZoomIn className="h-3 w-3" />
            放大
          </button>
        </div>
        <div className="p-4 flex justify-center overflow-x-auto" dangerouslySetInnerHTML={{ __html: code }} />
      </div>
      {zoomed && (
        <VisualizationZoomOverlay title="SVG 预览" onClose={() => setZoomed(false)}>
          <div className="bg-white dark:bg-[#1e1e2e] rounded-lg p-8" dangerouslySetInnerHTML={{ __html: code }} />
        </VisualizationZoomOverlay>
      )}
    </>
  );
}

/**
 * Clean Mermaid code: strip markdown fences, HTML wrappers, and leading/trailing noise.
 * LLMs sometimes ignore "output only raw syntax" instructions.
 */
function cleanMermaidCode(raw: string): string {
  let cleaned = raw.trim();

  // Strip markdown code fences: ```mermaid ... ``` or ``` ... ```
  cleaned = cleaned.replace(/^```(?:mermaid)?\s*\n?/i, '');
  cleaned = cleaned.replace(/\n?```\s*$/i, '');

  // If the code is an HTML document wrapping a mermaid div, extract the diagram text
  const mermaidDivMatch = cleaned.match(/<div[^>]*class=["']mermaid["'][^>]*>([\s\S]*?)<\/div>/i);
  if (mermaidDivMatch) {
    cleaned = mermaidDivMatch[1].trim();
  }

  // Remove any remaining HTML tags (LLM sometimes adds <br>, <p>, etc.)
  if (cleaned.includes('<') && cleaned.includes('>')) {
    // Only strip if there are actual HTML tags, not Mermaid syntax with angle brackets
    const withoutHtml = cleaned.replace(/<\/?[a-zA-Z][^>]*>/g, '');
    // If stripping HTML significantly reduced the content, it was HTML-wrapped
    if (withoutHtml.length < cleaned.length * 0.8) {
      cleaned = withoutHtml.trim();
    }
  }

  // Fix: escape square brackets inside node labels
  // Mermaid uses [label] for rectangular nodes, so [a,b] inside a label breaks parsing.
  // Wrap labels containing [ or ] in double quotes: B[区间 [a,b]] → B["区间 [a,b]"]
  cleaned = cleaned.replace(
    /(\b\w+\b)\[([^\]]*(?:\[[^\]]*\][^\]]*)*)\]/g,
    (_match, nodeId, label) => {
      if (label.includes('[')) {
        return `${nodeId}["${label}"]`;
      }
      return _match;
    }
  );

  return cleaned.trim();
}

/** Mermaid diagram renderer — dynamically loads mermaid.js */
function MermaidRenderer({ code }: { code: string }) {
  const [svgHtml, setSvgHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewSource, setViewSource] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const cleanCode = useMemo(() => cleanMermaidCode(code), [code]);

  useEffect(() => {
    if (viewSource) return;

    let cancelled = false;

    async function render() {
      try {
        const mermaid = (await import('mermaid')).default;
        if (cancelled) return;

        mermaid.initialize({
          startOnLoad: false,
          theme: 'default',
          securityLevel: 'loose',
          logLevel: 'error',
        });

        const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

        // mermaid v10/v11 compatible: render(id, text, container?)
        const result = await mermaid.render(id, cleanCode);
        const svgOutput = typeof result === 'string' ? result : result.svg;
        if (!cancelled && svgOutput) {
          setSvgHtml(svgOutput);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '图表渲染失败');
        }
      }
    }

    render();
    return () => { cancelled = true; };
  }, [cleanCode, viewSource]);

  if (error && !viewSource) {
    return (
      <div className="my-3 rounded-lg border overflow-hidden">
        <div className="flex items-center justify-between border-b bg-red-50 dark:bg-red-950 px-3 py-1.5">
          <span className="text-[11px] font-medium text-red-600 dark:text-red-400">
            渲染错误：{error.slice(0, 120)}
          </span>
          <button
            onClick={() => { setViewSource(true); setError(null); }}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <Code2 className="h-3 w-3" />
            查看源码
          </button>
        </div>
        <CodeBlock className="border-0 rounded-none" code={cleanCode} language="mermaid">
          <CodeBlockCopyButton className="h-5 w-5 text-muted-foreground hover:text-foreground" />
        </CodeBlock>
      </div>
    );
  }

  return (
    <>
      <div className="my-3 rounded-lg border bg-white dark:bg-[#1e1e2e] overflow-hidden">
        <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-1.5">
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <Eye className="h-3 w-3" />
            图表预览
          </span>
          <div className="flex items-center gap-2">
            {svgHtml && !viewSource && (
              <button
                onClick={() => setZoomed(true)}
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <ZoomIn className="h-3 w-3" />
                放大
              </button>
            )}
            <button
              onClick={() => { setViewSource(!viewSource); setError(null); }}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <Code2 className="h-3 w-3" />
              {viewSource ? '预览' : '源码'}
            </button>
          </div>
        </div>
        {viewSource ? (
          <CodeBlock className="border-0 rounded-none" code={cleanCode} language="mermaid">
            <CodeBlockCopyButton className="h-5 w-5 text-muted-foreground hover:text-foreground" />
          </CodeBlock>
        ) : (
          <div className="p-4 flex justify-center overflow-x-auto">
            {svgHtml ? (
              <div dangerouslySetInnerHTML={{ __html: svgHtml }} />
            ) : (
              <div className="flex items-center gap-2 text-[12px] text-muted-foreground py-8">
                <div className="h-3 w-3 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                正在渲染图表...
              </div>
            )}
          </div>
        )}
      </div>
      {zoomed && svgHtml && (
        <VisualizationZoomOverlay title="图表预览" onClose={() => setZoomed(false)}>
          <div className="bg-white dark:bg-[#1e1e2e] rounded-lg p-8" dangerouslySetInnerHTML={{ __html: svgHtml }} />
        </VisualizationZoomOverlay>
      )}
    </>
  );
}

/** HTML / Chart.js iframe sandbox renderer */
function HtmlIframeRenderer({ code, format }: { code: string; format: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [viewSource, setViewSource] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [srcDoc, setSrcDoc] = useState<string>('');

  useEffect(() => {
    // Use srcdoc for secure rendering (avoids blob URL CSP issues)
    setSrcDoc(code);
  }, [code]);

  const previewLabel = format === 'html' ? 'HTML 预览' : 'Chart.js 预览';

  return (
    <>
      <div className="my-3 rounded-lg border overflow-hidden">
        <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-1.5">
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <Eye className="h-3 w-3" />
            {previewLabel}
          </span>
          <div className="flex items-center gap-2">
            {!viewSource && (
              <button
                onClick={() => setZoomed(true)}
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <ZoomIn className="h-3 w-3" />
                放大
              </button>
            )}
            <button
              onClick={() => setViewSource(!viewSource)}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <Code2 className="h-3 w-3" />
              {viewSource ? '预览' : '源码'}
            </button>
          </div>
        </div>
        {viewSource ? (
          <CodeBlock className="border-0 rounded-none" code={code} language={format as BundledLanguage}>
            <CodeBlockCopyButton className="h-5 w-5 text-muted-foreground hover:text-foreground" />
          </CodeBlock>
        ) : (
          <iframe
            ref={iframeRef}
            srcDoc={srcDoc}
            className="w-full bg-white dark:bg-[#1e1e2e]"
            style={{ minHeight: '400px', border: 'none' }}
            sandbox="allow-scripts allow-same-origin"
            title="Visualization preview"
          />
        )}
      </div>
      {zoomed && (
        <VisualizationZoomOverlay title={previewLabel} onClose={() => setZoomed(false)}>
          <iframe
            srcDoc={srcDoc}
            className="w-full bg-white dark:bg-[#1e1e2e] rounded-lg"
            style={{ minHeight: '600px', minWidth: '600px', border: 'none' }}
            sandbox="allow-scripts allow-same-origin"
            title="Visualization zoom"
          />
        </VisualizationZoomOverlay>
      )}
    </>
  );
}

interface EnhancedMarkdownMessageProps {
  content: string;
  className?: string;
  /** Override prose styles for specific contexts */
  proseClass?: string;
  /** When set, enables visualization rendering for matching code blocks */
  renderMode?: string;
}

/**
 * Enhanced markdown renderer with:
 * - Syntax-highlighted code blocks (Shiki) with language label + copy button
 * - Styled GFM tables with alternating rows
 * - KaTeX math formulas ($...$ inline, $$...$$ block)
 * - Callout blocks (> [!NOTE/WARNING/TIP/DANGER])
 * - Standard prose typography
 */
export function EnhancedMarkdownMessage({
  content,
  className,
  proseClass = 'prose prose-sm dark:prose-invert max-w-none',
  renderMode,
}: EnhancedMarkdownMessageProps) {
  // Pre-process callout blocks: convert "> [!TYPE]\n> content" to custom syntax
  // that the markdown parser can handle as a blockquote with our custom rendering
  const processedContent = useMemo(() => {
    let text = content;
    // Convert LaTeX math delimiters to remark-math compatible format
    // \[ ... \] → $$...$$ (display math)
    // \( ... \) → $...$ (inline math)
    text = preprocessMathDelimiters(text);
    // Convert callout blocks
    text = preprocessCallouts(text);
    return text;
  }, [content]);

  return (
    <div className={cn('min-w-0 break-words', proseClass, className)}>
      <ReactMarkdown
        remarkPlugins={[remarkMath, remarkGfm]}
        rehypePlugins={[rehypeKatex]}
        components={{
          pre: ({ children }) => <>{children}</>,
          code: renderMode
            ? (props: ComponentPropsWithoutRef<'code'>) => <CodeComponentWithViz {...props} renderMode={renderMode} />
            : CodeComponent,
          table: TableComponent,
          thead: TheadComponent,
          th: ThComponent,
          td: TdComponent,
          tr: TrComponent,
          blockquote: BlockquoteComponent,
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}

/**
 * Backward-compatible alias — same as EnhancedMarkdownMessage
 */
export function MarkdownMessage({ content }: { content: string }) {
  return <EnhancedMarkdownMessage content={content} />;
}

/**
 * Pre-process GitHub-style callout blocks into a format
 * that renders as colored CalloutBlock components.
 *
 * Input:  > [!NOTE]\n> Some text\n> More text
 * Output: Custom HTML that CalloutBlock can render
 *
 * Strategy: Replace `> [!TYPE]` patterns with our custom
 * `:::callout[type]` fence syntax before markdown parsing.
 */
function preprocessCallouts(text: string): string {
  // Match blockquote lines starting with > [!TYPE]
  const lines = text.split('\n');
  const result: string[] = [];
  let inCallout = false;
  let calloutType = '';
  let calloutLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for callout start: > [!TYPE]
    const calloutMatch = line.match(/^>\s*\[!(\w+)\]\s*(.*)/);
    if (calloutMatch && !inCallout) {
      inCallout = true;
      calloutType = calloutMatch[1].toLowerCase();
      const firstLine = calloutMatch[2].trim();
      if (firstLine) calloutLines.push(firstLine);
      continue;
    }

    // Inside callout: continue collecting > lines
    if (inCallout) {
      if (line.startsWith('>')) {
        const content = line.replace(/^>\s?/, '').trim();
        if (content) calloutLines.push(content);
      } else {
        // End of callout block
        const parsedType = parseCalloutType(calloutType);
        const title = calloutType.charAt(0).toUpperCase() + calloutType.slice(1).toLowerCase();
        result.push(`<div class="callout-block" data-callout-type="${parsedType}" data-callout-title="${title}">`);
        result.push(...calloutLines);
        result.push('</div>');
        result.push(line);
        inCallout = false;
        calloutType = '';
        calloutLines = [];
      }
      continue;
    }

    result.push(line);
  }

  // Flush any remaining callout
  if (inCallout) {
    const parsedType = parseCalloutType(calloutType);
    const title = calloutType.charAt(0).toUpperCase() + calloutType.slice(1).toLowerCase();
    result.push(`<div class="callout-block" data-callout-type="${parsedType}" data-callout-title="${title}">`);
    result.push(...calloutLines);
    result.push('</div>');
  }

  return result.join('\n');
}
