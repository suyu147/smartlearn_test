'use client';

import { useState, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Play, ChevronDown, Loader2, Terminal, X } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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

interface Props {
  code: string;
  language: string;
  label: string;
  stdin?: string;
  onClose?: () => void;
  /** 当 sandbox 不可用时，仅展示代码（只读模式） */
  readOnly?: boolean;
}

export function InlineCodeRunner({ code: initialCode, language: initialLanguage, label, stdin: initialStdin, onClose, readOnly }: Props) {
  const [code, setCode] = useState(initialCode);
  const [language, setLanguage] = useState<Language>(initialLanguage as Language || 'python');
  const [stdin, setStdin] = useState(initialStdin ?? '');
  const [stdinOpen, setStdinOpen] = useState(false);
  const [status, setStatus] = useState<RunStatus>('idle');
  const [stdout, setStdout] = useState('');
  const [stderr, setStderr] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const handleRun = useCallback(async () => {
    if (readOnly) return;
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
  }, [code, language, stdin, readOnly]);

  const statusConfig: Record<RunStatus, { label: string; variant: 'secondary' | 'default' | 'destructive' }> = {
    idle: { label: '就绪', variant: 'secondary' },
    running: { label: '运行中', variant: 'default' },
    error: { label: '错误', variant: 'destructive' },
  };

  const currentStatus = statusConfig[status];

  return (
    <div className="flex h-full flex-col border-l bg-background">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-sm font-semibold truncate">{label}</h3>
          <Badge variant={currentStatus.variant} className="shrink-0">{currentStatus.label}</Badge>
        </div>
        {onClose && (
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Select value={language} onValueChange={(v) => setLanguage(v as Language)}>
            <SelectTrigger className="w-32 h-8 text-xs">
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
          {!readOnly && (
            <Button onClick={handleRun} disabled={status === 'running'} size="sm" className="h-8">
              {status === 'running' ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Play className="h-3 w-3" />
              )}
              <span className="ml-1">运行</span>
            </Button>
          )}
        </div>

        <Textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          readOnly={readOnly}
          className="min-h-40 font-mono text-xs bg-zinc-950 text-green-400 border-zinc-800"
          spellCheck={false}
        />

        {!readOnly && (
          <Collapsible open={stdinOpen} onOpenChange={setStdinOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1 h-7 text-xs">
                <ChevronDown className={`size-3 transition-transform ${stdinOpen ? 'rotate-180' : ''}`} />
                标准输入 (stdin)
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <Textarea
                value={stdin}
                onChange={(e) => setStdin(e.target.value)}
                placeholder="输入 stdin 内容..."
                className="mt-2 font-mono text-xs"
                spellCheck={false}
              />
            </CollapsibleContent>
          </Collapsible>
        )}

        {(stdout || stderr || errorMessage) && (
          <div className="space-y-2">
            {errorMessage && (
              <div className="rounded-lg border border-red-800 bg-red-950/50 p-2">
                <p className="text-xs font-medium text-red-400 mb-1">错误</p>
                <pre className="text-xs text-red-300 whitespace-pre-wrap">{errorMessage}</pre>
              </div>
            )}
            {stdout && (
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-2">
                <p className="text-xs font-medium text-zinc-400 mb-1 flex items-center gap-1">
                  <Terminal className="size-3" />
                  输出
                </p>
                <pre className="text-xs text-green-400 whitespace-pre-wrap">{stdout}</pre>
              </div>
            )}
            {stderr && (
              <div className="rounded-lg border border-yellow-800 bg-yellow-950/50 p-2">
                <p className="text-xs font-medium text-yellow-400 mb-1">错误输出</p>
                <pre className="text-xs text-yellow-300 whitespace-pre-wrap">{stderr}</pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
