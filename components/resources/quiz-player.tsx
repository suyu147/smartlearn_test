'use client';

import { useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { parseJsonResponse } from '@/lib/generation/json-repair';
import { useSettingsStore } from '@/lib/store/settings';
import { useLearningProfileStore } from '@/lib/store/learning-profile';
import { useLearningPathStore } from '@/lib/store/learning-path';
import { useSessionsStore } from '@/lib/store/sessions';
import type { Quiz } from '@/lib/types/resource';
import type { ProfileDimensions } from '@/lib/types/profile';

function checkAnswer(quiz: Quiz, userAnswer: string | undefined): boolean {
  if (!userAnswer) return false;

  if (quiz.type === 'choice') {
    const correctAnswers = Array.isArray(quiz.answer) ? quiz.answer : [quiz.answer];
    return correctAnswers.some(
      (a) => a.trim().toLowerCase() === userAnswer.trim().toLowerCase()
    );
  }

  if (quiz.type === 'fill') {
    const correctAnswers = Array.isArray(quiz.answer) ? quiz.answer : [quiz.answer];
    return correctAnswers.some(
      (a) => a.trim().toLowerCase() === userAnswer.trim().toLowerCase()
    );
  }

  return false;
}

function getCorrectAnswerDisplay(quiz: Quiz): string {
  return Array.isArray(quiz.answer) ? quiz.answer.join(' / ') : quiz.answer;
}

interface EvaluationResult {
  weakPoints: string[];
  strongPoints: string[];
  suggestedFocus: string[];
  profileUpdate: ProfileDimensions | null;
  feedback: string;
}

type EvalStatus = 'idle' | 'evaluating' | 'done';

export function QuizPlayer({
  content,
  title,
  onResult,
}: {
  content: string;
  title: string;
  onResult?: (result: { score: number; completed: boolean }) => void;
}) {
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, string>>({});
  const [showResults, setShowResults] = useState(false);
  const [evalStatus, setEvalStatus] = useState<EvalStatus>('idle');
  const [evaluationResult, setEvaluationResult] = useState<EvaluationResult | null>(null);
  const [evalScore, setEvalScore] = useState<number>(0);

  const { providerId, modelId, apiKey, baseUrl } = useSettingsStore();
  const { profile, updateDimensions } = useLearningProfileStore();
  const { path } = useLearningPathStore();
  const { currentSessionId } = useSessionsStore();

  const quizzes = useMemo<Quiz[]>(() => {
    try {
      const parsed = parseJsonResponse<Quiz[]>(content);
      if (Array.isArray(parsed)) return parsed;
      if (parsed) return [parsed as unknown as Quiz];
    } catch {
      // ignore parse errors
    }
    return [];
  }, [content]);

  const results = useMemo(() => {
    if (!showResults || quizzes.length === 0) return null;
    const details = quizzes.map((quiz, index) => ({
      index,
      correct: checkAnswer(quiz, selectedAnswers[index]),
    }));
    const correctCount = details.filter((d) => d.correct).length;
    const total = quizzes.length;
    const score = total > 0 ? Math.round((correctCount / total) * 100) : 0;
    return { details, correctCount, total, score };
  }, [showResults, quizzes, selectedAnswers]);

  const handleEvaluate = useCallback(async () => {
    if (!results) return;

    setEvalStatus('evaluating');
    setEvaluationResult(null);

    const quizResults = quizzes.map((quiz, index) => ({
      questionId: quiz.id || String(index),
      question: quiz.question,
      knowledgePoints: quiz.knowledgePoints,
      correct: checkAnswer(quiz, selectedAnswers[index]),
      userAnswer: selectedAnswers[index] || '',
      correctAnswer: Array.isArray(quiz.answer) ? quiz.answer.join(' / ') : quiz.answer,
      difficulty: quiz.difficulty,
    }));

    try {
      const response = await fetch('/api/v1/smartlearn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'quiz_result',
          sessionId: currentSessionId,
          profile: profile?.dimensions ?? null,
          goal: path?.goal ?? '',
          completedNodes: path?.nodes.filter((node) => node.status === 'completed') ?? [],
          currentNodeId: path?.nodes.find((node) => node.status === 'in_progress')?.id ?? null,
          quizResults,
          aiConfig: { providerId, modelId, apiKey, baseUrl },
        }),
      });

      if (!response.ok) {
        setEvalStatus('idle');
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        setEvalStatus('idle');
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'evaluation_result') {
              const raw = data.evaluation;
              const normalized: EvaluationResult = {
                weakPoints: Array.isArray(raw?.weakPoints) ? raw.weakPoints : [],
                strongPoints: Array.isArray(raw?.strongPoints) ? raw.strongPoints : [],
                suggestedFocus: Array.isArray(raw?.suggestedFocus)
                  ? raw.suggestedFocus
                  : typeof raw?.suggestedFocus === 'string'
                    ? [raw.suggestedFocus]
                    : [],
                profileUpdate: raw?.profileUpdate ?? null,
                feedback: typeof raw?.feedback === 'string' ? raw.feedback : '',
              };
              setEvaluationResult(normalized);
              setEvalScore(data.score);
              if (normalized.profileUpdate) {
                updateDimensions(normalized.profileUpdate);
              }
            }
          } catch {
            continue;
          }
        }
      }

      setEvalStatus('done');
    } catch {
      setEvalStatus('idle');
    }
  }, [results, quizzes, selectedAnswers, profile, path, currentSessionId, providerId, modelId, apiKey, baseUrl, updateDimensions]);

  if (quizzes.length === 0) {
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {title}
          <Badge variant="secondary">{quizzes.length}题</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {showResults && results && (
          <div className="rounded-lg border bg-muted/50 p-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">评分结果</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold">{results.score}</span>
                  <span className="text-lg text-muted-foreground">分</span>
                </div>
              </div>
              <div className="text-right space-y-1">
                <p className="text-sm text-muted-foreground">
                  正确 {results.correctCount} / {results.total} 题
                </p>
                <div className="h-2 w-32 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full transition-all ${
                      results.score >= 60 ? 'bg-green-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${results.score}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">{results.score}%</p>
              </div>
            </div>
          </div>
        )}

        {evaluationResult && (
          <div className="rounded-lg border bg-blue-50/50 dark:bg-blue-950/20 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Badge className="bg-blue-600">评估结果</Badge>
              <span className="text-sm text-muted-foreground">得分 {evalScore} 分</span>
            </div>

            {evaluationResult.feedback && (
              <p className="text-sm">{evaluationResult.feedback}</p>
            )}

            {evaluationResult.strongPoints.length > 0 && (
              <div>
                <p className="text-sm font-medium text-green-700 dark:text-green-400">掌握良好</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {evaluationResult.strongPoints.map((point, i) => (
                    <Badge key={i} variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
                      {point}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {evaluationResult.weakPoints.length > 0 && (
              <div>
                <p className="text-sm font-medium text-red-700 dark:text-red-400">薄弱知识点</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {evaluationResult.weakPoints.map((point, i) => (
                    <Badge key={i} variant="secondary" className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300">
                      {point}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {evaluationResult.suggestedFocus.length > 0 && (
              <div>
                <p className="text-sm font-medium text-amber-700 dark:text-amber-400">建议重点学习</p>
                <ul className="mt-1 list-inside list-disc text-sm text-muted-foreground">
                  {evaluationResult.suggestedFocus.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {quizzes.map((quiz, index) => {
          const isCorrect = showResults && checkAnswer(quiz, selectedAnswers[index]);

          return (
            <div
              key={quiz.id || index}
              className={`space-y-3 rounded-lg border p-4 ${
                showResults
                  ? isCorrect
                    ? 'border-green-500/50 bg-green-500/5'
                    : 'border-red-500/50 bg-red-500/5'
                  : ''
              }`}
            >
              <div className="flex items-start gap-2">
                <Badge variant="outline" className="shrink-0">
                  {index + 1}
                </Badge>
                <div className="flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">{quiz.question}</p>
                    {showResults && (
                      <span className={`shrink-0 text-lg ${isCorrect ? 'text-green-600' : 'text-red-600'}`}>
                        {isCorrect ? '✓' : '✗'}
                      </span>
                    )}
                  </div>
                  <Badge variant="secondary" className="mt-1 text-xs">
                    {quiz.type === 'choice' ? '选择题' : quiz.type === 'fill' ? '填空题' : quiz.type === 'short_answer' ? '简答题' : quiz.type === 'coding' ? '编程题' : '案例分析'}
                    · 难度 {quiz.difficulty}/5
                  </Badge>
                </div>
              </div>

              {quiz.options && quiz.options.length > 0 && (
                <div className="space-y-2 pl-6">
                  {quiz.options.map((option, optIdx) => {
                    const isSelected = selectedAnswers[index] === option;
                    const isCorrectOption = (() => {
                      const correctAnswers = Array.isArray(quiz.answer) ? quiz.answer : [quiz.answer];
                      return correctAnswers.some(
                        (a) => a.trim().toLowerCase() === option.trim().toLowerCase()
                      );
                    })();

                    let optionClass = 'hover:bg-muted';
                    if (showResults) {
                      if (isCorrectOption) {
                        optionClass = 'border-green-500 bg-green-500/10';
                      } else if (isSelected && !isCorrectOption) {
                        optionClass = 'border-red-500 bg-red-500/10';
                      } else {
                        optionClass = 'opacity-50';
                      }
                    } else if (isSelected) {
                      optionClass = 'border-primary bg-primary/5';
                    }

                    return (
                      <button
                        key={optIdx}
                        onClick={() => {
                          if (!showResults) {
                            setSelectedAnswers((prev) => ({ ...prev, [index]: option }));
                          }
                        }}
                        disabled={showResults}
                        className={`w-full rounded-lg border p-3 text-left text-sm transition-colors ${optionClass}`}
                      >
                        <span className="mr-2 font-medium">
                          {String.fromCharCode(65 + optIdx)}.
                        </span>
                        {option}
                        {showResults && isCorrectOption && (
                          <span className="ml-2 text-green-600">✓</span>
                        )}
                        {showResults && isSelected && !isCorrectOption && (
                          <span className="ml-2 text-red-600">✗</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {quiz.type === 'fill' && (
                <div className="pl-6">
                  <input
                    type="text"
                    value={selectedAnswers[index] || ''}
                    onChange={(e) => {
                      if (!showResults) {
                        setSelectedAnswers((prev) => ({ ...prev, [index]: e.target.value }));
                      }
                    }}
                    disabled={showResults}
                    placeholder="请输入答案"
                    className={`w-full rounded-lg border p-3 text-sm outline-none transition-colors ${
                      showResults
                        ? isCorrect
                          ? 'border-green-500 bg-green-500/5'
                          : 'border-red-500 bg-red-500/5'
                        : 'focus:border-primary'
                    }`}
                  />
                </div>
              )}

              {showResults && !isCorrect && (
                <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-3 text-sm">
                  <p className="font-medium text-green-700 dark:text-green-400">正确答案：</p>
                  <p className="mt-1 text-green-600 dark:text-green-300">{getCorrectAnswerDisplay(quiz)}</p>
                </div>
              )}

              {showResults && quiz.explanation && (
                <div className="rounded-lg bg-muted p-3 text-sm">
                  <p className="font-medium">解析：</p>
                  <p className="mt-1 text-muted-foreground">{quiz.explanation}</p>
                </div>
              )}
            </div>
          );
        })}

        <div className="flex gap-3">
          <Button
            onClick={() => {
              const correctCount = quizzes.filter((quiz, index) => checkAnswer(quiz, selectedAnswers[index])).length;
              const score = quizzes.length > 0 ? Math.round((correctCount / quizzes.length) * 100) : 0;
              setShowResults(true);
              onResult?.({ score, completed: true });
            }}
            disabled={Object.keys(selectedAnswers).length === 0}
          >
            提交答案
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setSelectedAnswers({});
              setShowResults(false);
              setEvalStatus('idle');
              setEvaluationResult(null);
            }}
          >
            重新作答
          </Button>
          {showResults && (
            <Button
              variant="outline"
              onClick={handleEvaluate}
              disabled={evalStatus === 'evaluating'}
            >
              {evalStatus === 'evaluating' ? '评估中...' : evalStatus === 'done' ? '重新评估' : '评估学习效果'}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
