'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useLearningProfileStore } from '@/lib/store/learning-profile';
import {
  PROFILE_DIMENSION_LABELS,
  DEFAULT_DIMENSIONS,
} from '@/lib/types/profile';
import type { ProfileDimensions } from '@/lib/types/profile';
import {
  calculateProfileCompleteness,
  calculateDimensionScores,
} from '@/lib/utils/profile-utils';
import { Radar, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

type DimensionKey = keyof ProfileDimensions;

const DIMENSION_KEYS = Object.keys(PROFILE_DIMENSION_LABELS) as DimensionKey[];

function DimensionSection({
  dimKey: _dimKey,
  label,
  score,
  data,
}: {
  dimKey: DimensionKey;
  label: string;
  score: number;
  data: unknown;
}) {
  const [expanded, setExpanded] = useState(false);
  const isWeak = score < 50;

  return (
    <div
      className={cn(
        'rounded-md border transition-colors',
        isWeak ? 'border-dashed border-orange-300 bg-orange-50/30' : 'border-border bg-card',
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="text-sm font-medium">{label}</span>
          <div className="mt-1 flex items-center gap-2">
            <Progress value={score} className="h-1.5 flex-1" />
            <span
              className={cn(
                'text-[11px] font-medium tabular-nums shrink-0',
                isWeak ? 'text-orange-500' : 'text-muted-foreground',
              )}
            >
              {score}
            </span>
          </div>
        </span>
        <div className="flex shrink-0 items-center gap-1.5">
          {isWeak && (
            <span className="text-[10px] text-orange-500 font-medium">待补充</span>
          )}
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 text-muted-foreground transition-transform',
              expanded && 'rotate-180',
            )}
          />
        </div>
      </button>

      {expanded && (
        <div className="border-t px-3 py-2.5">
          <pre className="whitespace-pre-wrap break-words text-[11px] font-mono leading-relaxed text-muted-foreground">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export function ProfileCard() {
  const { profile } = useLearningProfileStore();
  const dimensions = profile?.dimensions ?? DEFAULT_DIMENSIONS;
  const completeness = calculateProfileCompleteness(dimensions);
  const scores = calculateDimensionScores(dimensions);

  const weakDimensions = DIMENSION_KEYS.filter((key) => scores[key] < 50);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Radar className="h-4 w-4" />
          学习画像
        </CardTitle>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">完整度</span>
          <Progress value={completeness} className="h-2 flex-1" />
          <span className="text-xs font-medium">{completeness}%</span>
        </div>
      </CardHeader>

      <CardContent className="space-y-2">
        {DIMENSION_KEYS.map((key) => (
          <DimensionSection
            key={key}
            dimKey={key}
            label={PROFILE_DIMENSION_LABELS[key]}
            score={scores[key]}
            data={dimensions[key]}
          />
        ))}

        {/* 画像诊断建议 */}
        {weakDimensions.length > 0 && (
          <div className="mt-4 rounded-md border border-dashed border-amber-300 bg-amber-50/40 p-3">
            <p className="text-xs font-medium text-amber-700 mb-1.5">画像诊断</p>
            <p className="text-[11px] text-amber-600 leading-relaxed">
              建议补充以下信息以获得更精准的学习推荐：
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {weakDimensions.map((key) => (
                <Badge
                  key={key}
                  variant="outline"
                  className="text-[10px] px-1.5 py-0 border-amber-300 text-amber-600"
                >
                  {PROFILE_DIMENSION_LABELS[key]}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {weakDimensions.length === 0 && completeness >= 100 && (
          <div className="mt-4 rounded-md border border-green-200 bg-green-50/40 p-3">
            <p className="text-xs text-green-700">画像已完善，推荐精准度已达最优。</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
