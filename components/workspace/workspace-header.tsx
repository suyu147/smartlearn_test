'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { BookOpen, Settings, History, Check, Plus, Trash2, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { LearningProfile } from '@/lib/types/profile';
import { calculateProfileCompleteness } from '@/lib/utils/profile-utils';
import { useSessionsStore } from '@/lib/store/sessions';
import { useLearningPathStore } from '@/lib/store/learning-path';
import { useResourcesStore } from '@/lib/store/resources';
import { useLearningProfileStore } from '@/lib/store/learning-profile';
import { useResourceDecisionsStore } from '@/lib/store/resource-decisions';
import type { AgentActivityEntry } from '@/lib/store/agent-activity';

interface Props {
  profile: LearningProfile | null;
  agentStatuses?: Record<string, AgentActivityEntry>;
}

export function WorkspaceHeader({ profile, agentStatuses = {} }: Props) {
  const router = useRouter();
  const completeness = calculateProfileCompleteness(profile?.dimensions ?? null);
  const { sessions, currentSessionId, switchSession, deleteSession, updateSessionStatus: _updateSessionStatus } = useSessionsStore();
  const { loadPathForSession, deleteSessionData: deletePathData, reset: resetPath } = useLearningPathStore();
  const { loadResourcesForSession, deleteSessionData: deleteResourceData, reset: resetResources } = useResourcesStore();
  const { clearArchivedProfile, restoreArchivedProfile, archiveCurrentProfile, reset: resetProfile, setChatOpen } = useLearningProfileStore();
  const clearSessionDecisions = useResourceDecisionsStore((state) => state.clearSessionLogs);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  function handleSwitchSession(sessionId: string) {
    if (sessionId === currentSessionId) return;

    const targetSession = sessions.find((session) => session.id === sessionId);
    if (targetSession?.profileId) {
      restoreArchivedProfile(targetSession.profileId);
    }

    switchSession(sessionId);
    loadPathForSession(sessionId);
    loadResourcesForSession(sessionId);
  }

  function handleNewChat() {
    const currentSession = sessions.find((session) => session.id === currentSessionId);
    if (profile && currentSession?.profileId === profile.id) {
      archiveCurrentProfile();
    }
    if (currentSessionId) {
      deletePathData(currentSessionId);
      deleteResourceData(currentSessionId);
      clearSessionDecisions(currentSessionId);
    } else {
      resetPath();
      resetResources();
    }
    resetProfile();
    setChatOpen(true);
    router.push('/profile?new=true');
  }

  function handleDeleteSession() {
    if (!deleteTarget) return;
    const targetSession = sessions.find(s => s.id === deleteTarget);
    // 清除关联数据：路径、资源、画像归档
    deletePathData(deleteTarget);
    deleteResourceData(deleteTarget);
    if (targetSession?.profileId) {
      clearArchivedProfile(targetSession.profileId);
    }
    deleteSession(deleteTarget);
    setDeleteTarget(null);
  }

  const currentSession = sessions.find(s => s.id === currentSessionId);
  const otherSessions = sessions.filter(s => s.id !== currentSessionId); // 当前会话不可删除

  const runningAgentCount = Object.values(agentStatuses).filter((entry) => entry.status === 'running').length;

  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
      <div className="flex h-12 items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          <span className="font-bold">SmartLearn</span>
          <Badge variant="secondary" className="text-xs">学习工作台</Badge>
        </div>

        <div className="flex items-center gap-2">
          {/* 新建对话 */}
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1"
            onClick={handleNewChat}
            title="新建学习对话（跳转到画像构建）"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="text-xs">新建对话</span>
          </Button>

          {/* 会话切换下拉 */}
          {sessions.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 gap-1">
                  <History className="h-3.5 w-3.5" />
                  <span className="max-w-[100px] truncate text-xs">
                    {currentSession?.title || '当前会话'}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel className="text-xs">切换会话</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {sessions.map((session) => (
                  <DropdownMenuItem
                    key={session.id}
                    onClick={() => handleSwitchSession(session.id)}
                    className="flex items-center justify-between text-xs cursor-pointer"
                  >
                    <span className="truncate flex-1">{session.title}</span>
                    <span className="ml-2 shrink-0 flex items-center gap-1">
                      <Badge variant="outline" className="text-[10px] px-1 py-0">
                        {session.status === 'active' ? '进行中' : '已完成'}
                      </Badge>
                      {session.id === currentSessionId && (
                        <Check className="h-3 w-3 text-primary" />
                      )}
                    </span>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setHistoryOpen(true)}
                  className="text-xs cursor-pointer"
                >
                  <Trash2 className="h-3 w-3 mr-2 text-destructive" />
                  管理历史记录
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {runningAgentCount > 0 && (
            <Badge variant="outline" className="text-xs gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-yellow-500 animate-pulse" />
              {runningAgentCount} Agent 运行中
            </Badge>
          )}

          <Badge variant="outline" className="text-xs">
            画像完整度 {completeness}%
          </Badge>
          <Link href="/settings">
            <Button variant="ghost" size="sm">
              <Settings className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>

      {/* 历史记录管理弹窗 */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5" />
              历史学习记录
            </DialogTitle>
            <DialogDescription>
              管理已归档的学习会话。当前会话不可删除。
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[350px]">
            {otherSessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                <History className="h-10 w-10 opacity-30" />
                <p className="mt-2 text-sm">暂无历史记录</p>
                <p className="text-xs">完成学习后，会话会自动保存在这里</p>
              </div>
            ) : (
              <div className="space-y-2">
                {otherSessions.map((session) => (
                  <div
                    key={session.id}
                    className="flex items-start justify-between rounded-lg border p-3"
                  >
                    <div className="min-w-0 flex-1 mr-2">
                      <p className="text-sm font-medium truncate">{session.title}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {new Date(session.createdAt).toLocaleDateString('zh-CN')} ·{' '}
                        {session.status === 'active' ? '进行中' : '已完成'}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 shrink-0 text-destructive hover:text-destructive"
                      onClick={() => {
                        setHistoryOpen(false);
                        setDeleteTarget(session.id);
                      }}
                      title="删除此会话"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setHistoryOpen(false)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除会话确认弹窗 */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除学习记录</AlertDialogTitle>
            <AlertDialogDescription>
              此操作将彻底删除该会话的路径、资源和关联的画像数据，且不可恢复。确定要删除吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSession}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  );
}