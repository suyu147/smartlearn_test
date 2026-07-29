'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useLearningPathStore } from '@/lib/store/learning-path';
import { BarChart3, Clock, BookOpen } from 'lucide-react';

export function PathProgress() {
  const { path } = useLearningPathStore();

  if (!path) return null;

  const total = path.nodes.length;
  const completed = path.nodes.filter((n) => n.status === 'completed').length;
  const inProgress = path.nodes.filter((n) => n.status === 'in_progress').length;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  const totalMinutes = path.nodes.reduce((a, n) => a + n.estimatedMinutes, 0);
  const completedMinutes = path.nodes
    .filter((n) => n.status === 'completed')
    .reduce((a, n) => a + n.estimatedMinutes, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="h-4 w-4" />
          学习进度
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="mb-1 flex justify-between text-sm">
            <span>总体进度</span>
            <span className="font-medium">{percentage}%</span>
          </div>
          <Progress value={percentage} className="h-2" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-muted/50 p-3 text-center">
            <div className="text-2xl font-bold">{completed}</div>
            <div className="text-xs text-muted-foreground">已完成</div>
          </div>
          <div className="rounded-lg bg-muted/50 p-3 text-center">
            <div className="text-2xl font-bold">{inProgress}</div>
            <div className="text-xs text-muted-foreground">进行中</div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">学习时间</span>
            <span className="ml-auto font-medium">
              {completedMinutes}/{totalMinutes} 分钟
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">知识节点</span>
            <span className="ml-auto font-medium">
              {completed}/{total}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
