'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Upload,
  Book,
  FileText,
  FileCheck,
  Search,
  CheckCircle2,
  Clock,
  Trash2,
  Loader2,
  AlertCircle,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useKnowledgeStore, type KnowledgeBase } from '@/lib/store/knowledge-store';
import { apiGet, apiDelete, apiUpload } from '@/lib/api-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface KBDocument {
  id: string;
  title: string;
  filePath: string;
  chunkCount: number;
  status: string;
  createdAt: string;
}

interface KBDetails {
  knowledgeBase: KnowledgeBase;
  documents: KBDocument[];
}

// ---------------------------------------------------------------------------
// Knowledge Page
// ---------------------------------------------------------------------------

export default function KnowledgePage() {
  const knowledgeBases = useKnowledgeStore((s) => s.knowledgeBases);
  const removeKB = useKnowledgeStore((s) => s.removeKB);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedKB, setSelectedKB] = useState<string | null>(null);
  const [kbDetails, setKbDetails] = useState<KBDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const fetchKnowledgeBases = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<{ knowledgeBases: KnowledgeBase[] }>(
        '/api/v1/knowledge',
      );
      // Replace all KBs in store at once to avoid stale comparisons
      useKnowledgeStore.setState({ knowledgeBases: data.knowledgeBases });
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载知识库失败');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch KBs on mount
  useEffect(() => {
    fetchKnowledgeBases();
  }, [fetchKnowledgeBases]);

  // Fetch KB details
  const fetchKBDetails = useCallback(async (kbId: string) => {
    setDetailsLoading(true);
    try {
      const data = await apiGet<KBDetails>(`/api/v1/knowledge/${kbId}`);
      setKbDetails(data);
    } catch {
    } finally {
      setDetailsLoading(false);
    }
  }, []);

  // Create KB
  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await useKnowledgeStore.getState().createKBOnServer(newName.trim(), newDesc.trim());
      setNewName('');
      setNewDesc('');
      setShowCreateForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建知识库失败');
    } finally {
      setCreating(false);
    }
  };

  // Delete KB
  const handleDelete = async (kbId: string) => {
    if (!confirm('确定删除此知识库及其所有文档？')) return;
    try {
      await apiDelete(`/api/v1/knowledge/${kbId}`);
      removeKB(kbId);
      if (selectedKB === kbId) {
        setSelectedKB(null);
        setKbDetails(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除知识库失败');
    }
  };

  // Upload document
  const handleUpload = async (kbId: string, file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await apiUpload(`/api/v1/knowledge/${kbId}/documents`, formData);
      // Refresh KB details
      if (selectedKB === kbId) {
        await fetchKBDetails(kbId);
      }
      // Refresh KB list to update counts
      await fetchKnowledgeBases();
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传文档失败');
    } finally {
      setUploading(false);
    }
  };

  // Select KB for details
  const handleSelectKB = (kbId: string) => {
    setSelectedKB(kbId);
    fetchKBDetails(kbId);
  };

  // Get icon based on status
  const getKBIcon = (kb: KnowledgeBase) => {
    if (kb.indexStatus === 'ready') return FileCheck;
    if (kb.indexStatus === 'indexing') return Clock;
    return Book;
  };

  return (
    <div className="flex h-full app-page-bg">
      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-y-auto">
        {/* Header */}
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="chip-primary">KNOWLEDGE</p>
              <h1 className="mt-2 text-[24px] font-bold tracking-tight text-[var(--foreground)]">
                知识库
              </h1>
              <p className="mt-1 text-[12.5px] text-[var(--muted-foreground)]">
                管理和检索你的学习资料
              </p>
            </div>
            <button
              onClick={() => setShowCreateForm(true)}
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-brand px-4 py-2 text-[13px] font-semibold text-white shadow-sm shadow-blue-500/30 transition-all hover:shadow-md"
            >
              <Plus className="h-3.5 w-3.5" />
              新建知识库
            </button>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mx-6 mt-4 flex items-center gap-2 bg-[var(--destructive)]/10 border border-[var(--destructive)]/30 rounded-lg px-4 py-3">
            <AlertCircle className="h-4 w-4 text-[var(--destructive)] shrink-0" />
            <p className="text-[13px] text-[var(--destructive)] flex-1">{error}</p>
            <button onClick={() => setError(null)}>
              <X className="h-4 w-4 text-[var(--destructive)]" />
            </button>
          </div>
        )}

        {/* Create form */}
        {showCreateForm && (
          <div className="px-6 py-4">
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 space-y-3">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-[13.5px] text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
                placeholder="知识库名称"
                autoFocus
              />
              <textarea
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-[13.5px] text-[var(--foreground)] outline-none focus:border-[var(--primary)] resize-none"
                placeholder="描述（可选）"
                rows={2}
              />
              <div className="flex gap-2">
                <button
                  onClick={handleCreate}
                  disabled={creating || !newName.trim()}
                  className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-1.5"
                >
                  {creating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                  创建
                </button>
                <button
                  onClick={() => {
                    setShowCreateForm(false);
                    setNewName('');
                    setNewDesc('');
                  }}
                  className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-[var(--muted)] text-[var(--foreground)] border border-[var(--border)] hover:bg-[var(--accent)] transition-colors"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Upload Zone */}
        {selectedKB && (
          <div className="px-6 py-4">
            <div
              className="border-2 border-dashed border-[var(--border)] rounded-xl p-6 text-center hover:border-[var(--primary)] transition-colors cursor-pointer relative"
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const files = e.dataTransfer.files;
                if (files.length > 0) {
                  handleUpload(selectedKB, files[0]);
                }
              }}
            >
              <input
                type="file"
                className="absolute inset-0 opacity-0 cursor-pointer"
                onChange={(e) => {
                  const files = e.target.files;
                  if (files && files.length > 0) {
                    handleUpload(selectedKB, files[0]);
                  }
                }}
              />
              {uploading ? (
                <Loader2 className="h-8 w-8 text-[var(--primary)] mx-auto mb-3 animate-spin" />
              ) : (
                <Upload className="h-8 w-8 text-[var(--muted-foreground)] mx-auto mb-3" />
              )}
              <p className="text-[14px] font-medium text-[var(--foreground)] mb-1">
                {uploading ? '上传中...' : '拖拽文件到此处或点击上传'}
              </p>
              <p className="text-[12px] text-[var(--muted-foreground)]">
                支持 PDF、DOCX、MD、TXT · 单文件最大 50MB
              </p>
            </div>
          </div>
        )}

        {/* Knowledge Base Cards */}
        <div className="px-6 pb-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 text-[var(--primary)] animate-spin" />
            </div>
          ) : knowledgeBases.length === 0 ? (
            <div className="text-center py-12">
              <Book className="h-10 w-10 text-[var(--muted-foreground)] mx-auto mb-4 opacity-40" />
              <p className="text-[14px] text-[var(--muted-foreground)]">
                暂无知识库，创建一个开始使用。
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {knowledgeBases.map((kb) => {
                const Icon = getKBIcon(kb);
                const isSelected = selectedKB === kb.id;
                return (
                  <div
                    key={kb.id}
                    onClick={() => handleSelectKB(kb.id)}
                    className={cn(
                      'bg-[var(--card)] border rounded-xl p-4 transition-colors cursor-pointer',
                      isSelected
                        ? 'border-[var(--primary)]'
                        : 'border-[var(--border)] hover:border-[var(--primary)]',
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-[var(--muted)]">
                        <Icon className="h-5 w-5 text-[var(--primary)]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <h3 className="text-[14px] font-semibold text-[var(--foreground)]">
                            {kb.name}
                          </h3>
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                'px-2 py-0.5 rounded-full text-[10px] font-medium flex items-center gap-1',
                                kb.indexStatus === 'ready'
                                  ? 'bg-[var(--success)] text-white'
                                  : kb.indexStatus === 'indexing'
                                    ? 'bg-[var(--warning)] text-white'
                                    : kb.indexStatus === 'error'
                                      ? 'bg-[var(--destructive)] text-white'
                                      : 'bg-[var(--muted)] text-[var(--muted-foreground)]',
                              )}
                            >
                              {kb.indexStatus === 'ready' ? (
                                <>
                                  <CheckCircle2 className="h-2.5 w-2.5" />
                                  就绪
                                </>
                              ) : kb.indexStatus === 'indexing' ? (
                                <>
                                  <Clock className="h-2.5 w-2.5" />
                                  索引中
                                </>
                              ) : (
                                kb.indexStatus
                              )}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(kb.id);
                              }}
                              className="p-1 rounded hover:bg-[var(--destructive)]/10 transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5 text-[var(--muted-foreground)] hover:text-[var(--destructive)]" />
                            </button>
                          </div>
                        </div>
                        {kb.description && (
                          <p className="text-[12px] text-[var(--muted-foreground)] mb-2">
                            {kb.description}
                          </p>
                        )}
                        <span className="text-[11px] text-[var(--muted-foreground)]">
                          {kb.documentCount} 文档 · {kb.blockCount} 块
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right Panel - KB Details & Documents */}
      <div className="w-96 border-l border-[var(--border)] bg-[var(--card)] overflow-y-auto">
        <div className="p-4 space-y-4">
          <h3 className="text-[12px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wide">
            {selectedKB ? '文档列表' : 'RAG 搜索预览'}
          </h3>

          {!selectedKB ? (
            <>
              {/* Search Input */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--muted-foreground)]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg pl-9 pr-3 py-2 text-[13px] text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
                  placeholder="搜索知识库..."
                />
              </div>

              <p className="text-[12px] text-[var(--muted-foreground)]">
                选择一个知识库查看其文档和索引详情。
              </p>
            </>
          ) : (
            <>
              {detailsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 text-[var(--primary)] animate-spin" />
                </div>
              ) : kbDetails ? (
                <div className="space-y-3">
                  {/* KB Info */}
                  <div className="bg-[var(--background)] rounded-lg p-3 space-y-2">
                    <h4 className="text-[13px] font-medium text-[var(--foreground)]">
                      {kbDetails.knowledgeBase.name}
                    </h4>
                    {kbDetails.knowledgeBase.description && (
                      <p className="text-[11px] text-[var(--muted-foreground)]">
                        {kbDetails.knowledgeBase.description}
                      </p>
                    )}
                    <div className="flex items-center gap-4 text-[11px] text-[var(--muted-foreground)]">
                      <span>{kbDetails.documents.length} 文档</span>
                      <span>
                        {kbDetails.documents.reduce(
                          (acc, d) => acc + d.chunkCount,
                          0,
                        )}{' '}
                        分块
                      </span>
                    </div>
                  </div>

                  {/* Document list */}
                  <div className="space-y-2">
                    {kbDetails.documents.map((doc) => (
                      <div
                        key={doc.id}
                        className="bg-[var(--background)] rounded-lg p-3 flex items-center justify-between"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-[12px] font-medium text-[var(--foreground)] truncate">
                            {doc.title}
                          </p>
                          <p className="text-[10px] text-[var(--muted-foreground)]">
                            {doc.chunkCount} 分块 · {doc.status}
                          </p>
                        </div>
                        {doc.status === 'indexed' ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-[var(--success)] shrink-0 ml-2" />
                        ) : (
                          <Clock className="h-3.5 w-3.5 text-[var(--warning)] shrink-0 ml-2 animate-pulse" />
                        )}
                      </div>
                    ))}

                    {kbDetails.documents.length === 0 && (
                      <p className="text-[12px] text-[var(--muted-foreground)] text-center py-4">
                        暂无文档，请在上方上传文件。
                      </p>
                    )}
                  </div>

                  <button
                    onClick={() => {
                      setSelectedKB(null);
                      setKbDetails(null);
                    }}
                    className="text-[12px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                  >
                    ← 返回列表
                  </button>
                </div>
              ) : (
                <p className="text-[12px] text-[var(--muted-foreground)]">
                  加载文档详情失败。
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
