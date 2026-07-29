'use client';

import { useState, useMemo } from 'react';
import type { QuizQuestion } from '@/lib/types/stage';
import { cn } from '@/lib/utils';

interface QuizRendererProps {
  questions: QuizQuestion[];
  title?: string;
}

export function QuizRenderer({ questions, title }: QuizRendererProps) {
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string[]>>({});
  const [showResults, setShowResults] = useState(false);

  const normalizedQuestions = useMemo(() =>
    questions.map((q) => ({
      ...q,
      type: q.type === 'short_answer' ? 'short-answer' : q.type,
    })),
  [questions]);

  const handleSelect = (questionId: string, value: string, isMultiple: boolean) => {
    setSelectedAnswers((prev) => {
      const current = prev[questionId] || [];
      if (isMultiple) {
        const next = current.includes(value)
          ? current.filter((v) => v !== value)
          : [...current, value];
        return { ...prev, [questionId]: next };
      }
      return { ...prev, [questionId]: [value] };
    });
  };

  const allAnswered = normalizedQuestions.every(
    (q) => q.type === 'short-answer' || (selectedAnswers[q.id]?.length ?? 0) > 0,
  );

  const score = useMemo(() => {
    if (!showResults) return 0;
    return normalizedQuestions.reduce((acc, q) => {
      const selected = selectedAnswers[q.id] || [];
      const correct = (Array.isArray(q.answer) ? q.answer : q.answer ? [q.answer] : []);
      if (correct.length === 0) return acc;
      const isCorrect =
        selected.length === correct.length &&
        correct.every((a) => selected.includes(a));
      return isCorrect ? acc + 1 : acc;
    }, 0);
  }, [showResults, normalizedQuestions, selectedAnswers]);

  return (
    <div className="w-full h-full overflow-y-auto bg-gradient-to-br from-purple-50 to-indigo-50 p-8">
      {title && (
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-purple-800">{title}</h2>
          <p className="text-sm text-purple-500 mt-1">
            共 {normalizedQuestions.length} 题
            {showResults && ` · 得分 ${score}/${normalizedQuestions.length}`}
          </p>
        </div>
      )}

      <div className="space-y-5 max-w-[880px] mx-auto">
        {normalizedQuestions.map((q, index) => {
          const isMultiple = q.type === 'multiple-choice';
          const selected = selectedAnswers[q.id] || [];
          const correct = (Array.isArray(q.answer) ? q.answer : q.answer ? [q.answer] : []);
          const isAnswered = selected.length > 0;

          return (
            <div
              key={q.id}
              className="bg-white rounded-xl shadow-sm border border-gray-100 p-5"
            >
              <div className="flex items-start gap-3 mb-3">
                <span className="shrink-0 w-7 h-7 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-sm font-bold">
                  {index + 1}
                </span>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                      {q.type === 'single-choice' ? '单选' :
                       q.type === 'multiple-choice' ? '多选' :
                       q.type === 'true-false' ? '判断' :
                       q.type === 'fill-blank' ? '填空' : '简答'}
                    </span>
                    {q.points && (
                      <span className="text-xs text-gray-400">{q.points}分</span>
                    )}
                  </div>
                  <p className="text-base font-medium text-gray-800">{q.question}</p>
                </div>
              </div>

              {q.options && q.options.length > 0 && (
                <div className="ml-10 space-y-2">
                  {q.options.map((opt) => {
                    const isSelected = selected.includes(opt.value);
                    const isCorrect = correct.includes(opt.value);
                    const showCorrectness = showResults && isAnswered;

                    return (
                      <button
                        key={opt.value}
                        onClick={() => !showResults && handleSelect(q.id, opt.value, isMultiple)}
                        className={cn(
                          'w-full text-left px-4 py-2.5 rounded-lg border transition-all text-sm',
                          showCorrectness && isCorrect && isSelected && 'bg-green-50 border-green-300 text-green-800',
                          showCorrectness && isCorrect && !isSelected && 'bg-green-50 border-green-200 text-green-700',
                          showCorrectness && !isCorrect && isSelected && 'bg-red-50 border-red-300 text-red-800',
                          !showCorrectness && isSelected && 'bg-purple-50 border-purple-300 text-purple-800',
                          !showCorrectness && !isSelected && 'bg-white border-gray-200 text-gray-700 hover:border-purple-200 hover:bg-purple-50/50',
                        )}
                      >
                        <span className="font-medium mr-2">{opt.value}.</span>
                        {opt.label}
                        {showCorrectness && isCorrect && (
                          <span className="ml-2 text-green-600">✓</span>
                        )}
                        {showCorrectness && !isCorrect && isSelected && (
                          <span className="ml-2 text-red-500">✗</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {q.type === 'short-answer' && !showResults && (
                <div className="ml-10 mt-2">
                  <textarea
                    className="w-full border border-gray-200 rounded-lg p-3 text-sm resize-none focus:outline-none focus:border-purple-300"
                    rows={3}
                    placeholder="请输入你的答案..."
                  />
                </div>
              )}

              {showResults && q.explanation && (
                <div className="ml-10 mt-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
                  <p className="text-sm text-blue-800">
                    <span className="font-medium">解析：</span>
                    {q.explanation}
                  </p>
                </div>
              )}

              {showResults && correct.length > 0 && !q.explanation && (
                <div className="ml-10 mt-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
                  <p className="text-sm text-blue-800">
                    <span className="font-medium">正确答案：</span>
                    {correct.join(', ')}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex justify-center gap-3 mt-6 pb-4">
        {!showResults ? (
          <button
            onClick={() => setShowResults(true)}
            disabled={!allAnswered}
            className={cn(
              'px-8 py-2.5 rounded-lg text-sm font-medium transition-all',
              allAnswered
                ? 'bg-purple-600 text-white hover:bg-purple-700 shadow-md'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed',
            )}
          >
            提交答案
          </button>
        ) : (
          <button
            onClick={() => {
              setShowResults(false);
              setSelectedAnswers({});
            }}
            className="px-8 py-2.5 rounded-lg text-sm font-medium bg-white border border-purple-200 text-purple-700 hover:bg-purple-50 transition-all"
          >
            重新作答
          </button>
        )}
      </div>
    </div>
  );
}
