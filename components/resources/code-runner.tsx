'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Play, ChevronDown, Loader2, Terminal } from 'lucide-react';

const LANGUAGES = [
  { value: 'python', label: 'Python' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'java', label: 'Java' },
  { value: 'cpp', label: 'C++' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
] as const;

type Language = (typeof LANGUAGES)[number]['value'];
type RunStatus = 'idle' | 'running' | 'error';

function detectLanguage(code: string): Language {
  const trimmed = code.trim();
  if (/^import\s+java\b/m.test(trimmed) || /^public\s+class\s/m.test(trimmed)) return 'java';
  if (/^#include\s*<(bits\/stdc\+\+\.h|iostream|stdio\.h|stdlib\.h)>/m.test(trimmed)) return 'cpp';
  if (/^package\s+main\b/m.test(trimmed) || /^func\s+main\(/m.test(trimmed)) return 'go';
  if (/^fn\s+main\(/m.test(trimmed) || /^(use|let|mut)\s/m.test(trimmed)) return 'rust';
  if (/^(export\s+)?(interface|type|enum)\s/m.test(trimmed) || /:\s*(string|number|boolean|void)\b/m.test(trimmed)) return 'typescript';
  if (/^(const|let|var|function|class)\s/m.test(trimmed) || /^(export|import)\s/m.test(trimmed)) return 'javascript';
  return 'python';
}

export function CodeRunner({ content, title }: { content: string; title: string }) {
  const [code, setCode] = useState(content);
  const [language, setLanguage] = useState<Language>(() => detectLanguage(content));
  const [stdin, setStdin] = useState('');
  const [stdinOpen, setStdinOpen] = useState(false);
  const [status, setStatus] = useState<RunStatus>('idle');
  const [stdout, setStdout] = useState('');
  const [stderr, setStderr] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const handleRun = useCallback(async () => {
    setStatus('running');
    setStdout('');
    setStderr('');
    setErrorMessage('');

    try {
      const response = await fetch('/api/v1/code/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language, stdin }),
      });

      const data = await response.json();

      if (data.error) {
        setStatus('error');
        setErrorMessage(data.error.message || '执行失败');
        return;
      }

      setStdout(data.stdout || '');
      setStderr(data.stderr || '');
      setStatus('idle');
    } catch (err) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : '网络请求失败');
    }
  }, [code, language, stdin]);

  const statusConfig: Record<RunStatus, { label: string; variant: 'secondary' | 'default' | 'destructive' }> = {
    idle: { label: '就绪', variant: 'secondary' },
    running: { label: '运行中', variant: 'default' },
    error: { label: '错误', variant: 'destructive' },
  };

  const currentStatus = statusConfig[status];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {title}
          <Badge variant={currentStatus.variant}>{currentStatus.label}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Select value={language} onValueChange={(v) => setLanguage(v as Language)}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((lang) => (
                <SelectItem key={lang.value} value={lang.value}>
                  {lang.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={handleRun} disabled={status === 'running'} size="sm">
            {status === 'running' ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Play />
            )}
            运行
          </Button>
        </div>

        <Textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="min-h-48 font-mono text-sm bg-zinc-950 text-green-400 border-zinc-800"
          spellCheck={false}
        />

        <Collapsible open={stdinOpen} onOpenChange={setStdinOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1">
              <ChevronDown className={`size-4 transition-transform ${stdinOpen ? 'rotate-180' : ''}`} />
              标准输入 (stdin)
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Textarea
              value={stdin}
              onChange={(e) => setStdin(e.target.value)}
              placeholder="输入 stdin 内容..."
              className="mt-2 font-mono text-sm"
              spellCheck={false}
            />
          </CollapsibleContent>
        </Collapsible>

        {(stdout || stderr || errorMessage) && (
          <div className="space-y-2">
            {errorMessage && (
              <div className="rounded-lg border border-red-800 bg-red-950/50 p-3">
                <p className="text-xs font-medium text-red-400 mb-1">错误</p>
                <pre className="text-sm text-red-300 whitespace-pre-wrap">{errorMessage}</pre>
              </div>
            )}
            {stdout && (
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                <p className="text-xs font-medium text-zinc-400 mb-1 flex items-center gap-1">
                  <Terminal className="size-3" />
                  输出 (stdout)
                </p>
                <pre className="text-sm text-green-400 whitespace-pre-wrap">{stdout}</pre>
              </div>
            )}
            {stderr && (
              <div className="rounded-lg border border-yellow-800 bg-yellow-950/50 p-3">
                <p className="text-xs font-medium text-yellow-400 mb-1">错误输出 (stderr)</p>
                <pre className="text-sm text-yellow-300 whitespace-pre-wrap">{stderr}</pre>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
