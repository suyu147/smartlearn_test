'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { CheckCircle2, XCircle, HelpCircle } from 'lucide-react';

export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex?: number;
  explanation?: string;
}

interface QuizCardProps {
  quiz: QuizQuestion;
  className?: string;
}

export function QuizCard({ quiz, className }: QuizCardProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const isCorrect = selectedIndex === quiz.correctIndex;

  const handleSubmit = () => {
    if (selectedIndex === null) return;
    setSubmitted(true);
  };

  const handleReset = () => {
    setSelectedIndex(null);
    setSubmitted(false);
  };

  return (
    <div className={cn(
      'my-3 rounded-lg border bg-card',
      submitted
        ? isCorrect
          ? 'border-green-200 dark:border-green-800'
          : 'border-red-200 dark:border-red-800'
        : 'border-border',
      className,
    )}>
      {/* Header */}
      <div className="flex items-center gap-2 border-b px-4 py-2.5">
        <HelpCircle className="h-4 w-4 text-violet-500" />
        <span className="text-sm font-semibold">练习题</span>
      </div>

      {/* Question */}
      <div className="px-4 pt-3 pb-2">
        <p className="text-sm font-medium">{quiz.question}</p>
      </div>

      {/* Options */}
      <div className="space-y-1.5 px-4 pb-3">
        {quiz.options.map((option, i) => {
          const label = String.fromCharCode(65 + i); // A, B, C, D
          const isSelected = selectedIndex === i;
          const isCorrectOption = submitted && i === quiz.correctIndex;
          const isWrongSelection = submitted && isSelected && !isCorrect;

          return (
            <button
              key={i}
              type="button"
              disabled={submitted}
              onClick={() => setSelectedIndex(i)}
              className={cn(
                'flex w-full items-start gap-2.5 rounded-md border px-3 py-2 text-left text-sm transition-colors',
                !submitted && isSelected && 'border-primary bg-primary/5',
                !submitted && !isSelected && 'border-border hover:border-primary/40 hover:bg-muted/50',
                isCorrectOption && 'border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-950',
                isWrongSelection && 'border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-950',
                submitted && 'cursor-default',
              )}
            >
              <span className={cn(
                'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-medium',
                !submitted && isSelected && 'bg-primary text-primary-foreground',
                !submitted && !isSelected && 'border border-muted-foreground/30 text-muted-foreground',
                isCorrectOption && 'bg-green-500 text-white',
                isWrongSelection && 'bg-red-500 text-white',
              )}>
                {isCorrectOption ? <CheckCircle2 className="h-3.5 w-3.5" /> :
                 isWrongSelection ? <XCircle className="h-3.5 w-3.5" /> :
                 label}
              </span>
              <span className="pt-px">{option}</span>
            </button>
          );
        })}
      </div>

      {/* Actions / Feedback */}
      <div className="border-t px-4 py-2.5">
        {!submitted ? (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={selectedIndex === null}
            className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            提交答案
          </button>
        ) : (
          <div className="space-y-2">
            <div className={cn(
              'flex items-center gap-1.5 text-sm font-medium',
              isCorrect ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400',
            )}>
              {isCorrect ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              {isCorrect ? '回答正确！' : '回答错误'}
            </div>
            {quiz.explanation && (
              <p className="text-xs text-muted-foreground">{quiz.explanation}</p>
            )}
            <button
              type="button"
              onClick={handleReset}
              className="text-xs text-primary hover:underline"
            >
              重新作答
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
