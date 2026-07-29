'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  FileText,
  GitBranch,
  CheckSquare,
  Play,
  Code,
  BookOpen,
  Trash2,
  Presentation,
} from 'lucide-react';
import { useResourcesStore } from '@/lib/store/resources';
import { RESOURCE_TYPE_LABELS, RESOURCE_TYPE_ICONS } from '@/lib/types/resource';
import { DocumentViewer } from './document-viewer';
import { MindmapViewer } from './mindmap-viewer';
import { QuizPlayer } from './quiz-player';
import { CodeRunner } from './code-runner';
import { VideoPlayer } from './video-player';
import { ReadingViewer } from './reading-viewer';

const iconMap: Record<string, React.ElementType> = {
  FileText,
  GitBranch,
  CheckSquare,
  Play,
  Code,
  BookOpen,
  Presentation,
};

export function ResourceGrid() {
  const { resources, removeResource } = useResourcesStore();
  const [selectedResource, setSelectedResource] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const selected = resources.find((r) => r.id === selectedResource);

  if (resources.length === 0) {
    return (
      <div className="flex h-[300px] items-center justify-center rounded-lg border border-dashed">
        <div className="text-center">
          <FileText className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-medium">暂无学习资源</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            输入知识点并点击&ldquo;生成资源&rdquo;，多智能体将为您协同创建个性化学习资源
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        {selected ? (
          <div>
            <div className="mb-3 flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedResource(null)}
              >
                ← 返回资源列表
              </Button>
              {deletingId === selected.id ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-destructive">确认删除？</span>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      removeResource(selected.id);
                      setSelectedResource(null);
                      setDeletingId(null);
                    }}
                  >
                    确认
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDeletingId(null)}
                  >
                    取消
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setDeletingId(selected.id)}
                >
                  <Trash2 className="mr-1 h-4 w-4" />
                  删除
                </Button>
              )}
            </div>
            {selected.type === 'document' && (
              <DocumentViewer content={selected.content} title={selected.title} />
            )}
            {selected.type === 'mindmap' && (
              <MindmapViewer content={selected.content} title={selected.title} />
            )}
            {selected.type === 'quiz' && (
              <QuizPlayer content={selected.content} title={selected.title} />
            )}
            {selected.type === 'code' && (
              <CodeRunner content={selected.content} title={selected.title} />
            )}
            {selected.type === 'video' && (
              <VideoPlayer content={selected.content} title={selected.title} videoData={selected.metadata?.videoData} />
            )}
            {selected.type === 'reading' && (
              <ReadingViewer content={selected.content} title={selected.title} />
            )}
            {selected.type === 'ppt' && (
              <div className="space-y-4">
                <div className="p-4 rounded-lg border bg-muted/30">
                  <h3 className="text-lg font-semibold mb-2">{selected.title}</h3>
                  <p className="text-sm text-muted-foreground mb-4">动态课件已生成，点击下方按钮查看完整演示</p>
                  <Button
                    className="bg-purple-600 hover:bg-purple-700 text-white"
                    onClick={() => window.open('/ppt', '_blank')}
                  >
                    <Presentation className="mr-2 h-4 w-4" />
                    打开动态课件
                  </Button>
                </div>
                <div className="prose dark:prose-invert max-w-none">
                  <pre className="text-sm whitespace-pre-wrap bg-muted/50 p-4 rounded-lg">{selected.content}</pre>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {resources.map((resource) => {
              const Icon = iconMap[RESOURCE_TYPE_ICONS[resource.type]] || FileText;
              return (
                <Card
                  key={resource.id}
                  className="cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5"
                  onClick={() => setSelectedResource(resource.id)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        <Badge variant="secondary" className="text-xs">
                          {RESOURCE_TYPE_LABELS[resource.type]}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1">
                        {resource.status === 'generating' && (
                          <Badge variant="outline" className="text-xs animate-pulse">
                            生成中
                          </Badge>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeletingId(resource.id);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <CardTitle className="text-sm">{resource.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {deletingId === resource.id ? (
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <span className="text-xs text-destructive">确认删除？</span>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={() => {
                            removeResource(resource.id);
                            setDeletingId(null);
                          }}
                        >
                          确认
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={() => setDeletingId(null)}
                        >
                          取消
                        </Button>
                      </div>
                    ) : (
                      <p className="line-clamp-2 text-xs text-muted-foreground">
                        {resource.content.slice(0, 100)}...
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
