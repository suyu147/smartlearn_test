'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Play,
  RotateCcw,
  FileText,
  Brain,
  Video,
  Code,
  Presentation,
  BookOpen,
  CheckSquare,
  Loader2,
  AlertCircle,
  Send,
  X,
} from 'lucide-react'
import { cn, generateId } from '@/lib/utils'
import { useLearningPathStore } from '@/lib/store/learning-path'
import { useResourcesStore } from '@/lib/store/resources'
import { useLearningProfileStore } from '@/lib/store/learning-profile'
import { useAuthStore } from '@/lib/store/auth-store'
import { useRouter } from 'next/navigation'
import { useSessionsStore } from '@/lib/store/sessions'
import { consumeSSEStream, apiGet, apiPost } from '@/lib/api-client'
import { getApiToken } from '@/lib/auth-token'
import { useI18n } from '@/lib/hooks/use-i18n'
import type { LearningPathNode } from '@/lib/types/learning-path'
import type { Resource, ResourceType } from '@/lib/types/resource'
import { RESOURCE_TYPE_LABELS } from '@/lib/types/resource'
import type { ProfileDimensions } from '@/lib/types/profile'
import { PROFILE_DIMENSION_LABELS, DEFAULT_DIMENSIONS } from '@/lib/types/profile'
import { ResourceViewer } from '@/components/workspace/resource-viewer'
import { PPTViewer } from '@/components/workspace/ppt-viewer'
import { ConceptPanel } from '@/components/workspace/concept-panel'
import { InlineCodeRunner } from '@/components/workspace/inline-code-runner'
import { KnowledgeGraphBar } from '@/components/workspace/knowledge-graph-bar'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import type { ConceptHotspot } from '@/lib/types/slides'
import type { CodeButton } from '@/lib/types/stage'
import type { Scene } from '@/lib/types/stage'
import { useResourceDecisionsStore } from '@/lib/store/resource-decisions'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Fallback user ID when no auth user is available */
const FALLBACK_USER_ID = 'anonymous'

const RESOURCE_ICON_MAP: Record<ResourceType, React.ComponentType<{ className?: string }>> = {
  document: FileText,
  mindmap: Brain,
  quiz: CheckSquare,
  video: Video,
  code: Code,
  reading: BookOpen,
  ppt: Presentation,
}

/** Map all 8 profile dimensions to 0-100 scores based on actual data. */
function computeDimensionScores(dimensions: ProfileDimensions): { label: string; value: number; detail?: string }[] {
  const levelMap: Record<string, number> = { beginner: 33, intermediate: 66, advanced: 100 }
  const speedMap: Record<string, number> = { slow: 33, moderate: 66, fast: 100 }

  // 1. knowledgeBase — average subject mastery, fallback to declared level
  const subjects = dimensions.knowledgeBase.subjects
  const kbScore = subjects.length > 0
    ? Math.round(subjects.reduce((a, s) => a + s.mastery * 100, 0) / subjects.length)
    : (levelMap[dimensions.knowledgeBase.level] ?? 33)

  // 2. cognitiveStyle — whether type + preference are configured
  const cogScore = dimensions.cognitiveStyle.preference
    ? 80
    : (dimensions.cognitiveStyle.type !== DEFAULT_DIMENSIONS.cognitiveStyle.type ? 50 : 30)

  // 3. learningGoals — completeness of short-term + long-term goals
  const hasLong = !!dimensions.learningGoals.longTerm
  const stCount = dimensions.learningGoals.shortTerm.length
  const goalScore = hasLong
    ? (stCount >= 2 ? 90 : stCount === 1 ? 70 : 50)
    : (stCount > 0 ? 50 : 20)

  // 4. weakPoints — inverted: fewer weak points = healthier
  const wpCount = dimensions.weakPoints.topics.length
  const weakScore = wpCount === 0 ? 60 : Math.max(10, 60 - wpCount * 10)

  // 5. timePreference — whether duration + slot are configured
  const tp = dimensions.timePreference
  const timeScore = tp.preferredDuration > 0
    ? (tp.preferredTimeSlot ? 85 : 60)
    : (tp.preferredTimeSlot ? 50 : 25)

  // 6. interests — whether domains + preferred formats are configured
  const intScore = dimensions.interests.domains.length > 0
    ? (dimensions.interests.preferredFormats.length > 0 ? 85 : 60)
    : (dimensions.interests.preferredFormats.length > 0 ? 45 : 20)

  // 7. learningPace — speed setting
  const paceScore = speedMap[dimensions.learningPace.speed] ?? 50

  // 8. errorPatterns — inverted: fewer recorded errors = better
  const errTotal = dimensions.errorPatterns.commonMistakes.length + dimensions.errorPatterns.difficultAreas.length
  const errScore = errTotal === 0 ? 50 : Math.max(10, 50 - errTotal * 5)

  return [
    { label: PROFILE_DIMENSION_LABELS.knowledgeBase, value: kbScore, detail: subjects.length > 0 ? `${subjects.length}科` : dimensions.knowledgeBase.level },
    { label: PROFILE_DIMENSION_LABELS.cognitiveStyle, value: cogScore, detail: dimensions.cognitiveStyle.preference || dimensions.cognitiveStyle.type },
    { label: PROFILE_DIMENSION_LABELS.learningGoals, value: goalScore, detail: stCount > 0 ? `${stCount}个目标` : (hasLong ? '仅有长期' : '未设置') },
    { label: PROFILE_DIMENSION_LABELS.weakPoints, value: weakScore, detail: `${wpCount}项` },
    { label: PROFILE_DIMENSION_LABELS.timePreference, value: timeScore, detail: tp.preferredDuration > 0 ? `${tp.preferredDuration}分钟` : '未设置' },
    { label: PROFILE_DIMENSION_LABELS.interests, value: intScore, detail: dimensions.interests.domains.length > 0 ? `${dimensions.interests.domains.length}个领域` : '未设置' },
    { label: PROFILE_DIMENSION_LABELS.learningPace, value: paceScore, detail: dimensions.learningPace.speed },
    { label: PROFILE_DIMENSION_LABELS.errorPatterns, value: errScore, detail: `${errTotal}项` },
  ]
}

// ---------------------------------------------------------------------------
// Learner snapshot shape (subset from /api/v1/smartlearn/profile)
// ---------------------------------------------------------------------------

interface LearnerSnapshot {
  analytics?: {
    weakTopics: string[]
    strongTopics: string[]
  }
  weakPoints?: Array<{ topic: string; mastery: number; priority: number }>
  errors?: Array<{ topic: string; count: number }>
  recentSessions?: Array<{
    quizResults: Array<{ correct: boolean }>
  }>
}

// ---------------------------------------------------------------------------
// Stream event shape from /api/v1/smartlearn SSE endpoints
// ---------------------------------------------------------------------------

interface SmartLearnStreamEvent {
  type: string
  source: string
  stage: string
  content: string
  metadata: Record<string, unknown>
  sessionId: string
  turnId: string
  seq: number
  timestamp: number
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function SmartLearnPage() {
  const i18n = useI18n()
  const router = useRouter()

  // -- Store selectors --
  const authUser = useAuthStore((s) => s.user)
  const userId = authUser?.id ?? FALLBACK_USER_ID
  const path = useLearningPathStore((s) => s.path)
  const setPath = useLearningPathStore((s) => s.setPath)
  const updateNodeStatus = useLearningPathStore((s) => s.updateNodeStatus)
  const pathReset = useLearningPathStore((s) => s.reset)
  const isPlanning = useLearningPathStore((s) => s.isPlanning)
  const setPlanning = useLearningPathStore((s) => s.setPlanning)
  const loadPathForSession = useLearningPathStore((s) => s.loadPathForSession)

  const resources = useResourcesStore((s) => s.resources)
  const addResource = useResourcesStore((s) => s.addResource)
  const resourcesReset = useResourcesStore((s) => s.reset)
  const loadResourcesForSession = useResourcesStore((s) => s.loadResourcesForSession)

  const profile = useLearningProfileStore((s) => s.profile)
  const setProfile = useLearningProfileStore((s) => s.setProfile)
  const updateDimensions = useLearningProfileStore((s) => s.updateDimensions)

  const currentSessionId = useSessionsStore((s) => s.currentSessionId)
  const createSession = useSessionsStore((s) => s.createSession)
  const getCurrentSession = useSessionsStore((s) => s.getCurrentSession)
  const sessions = useSessionsStore((s) => s.sessions)
  const deleteSession = useSessionsStore((s) => s.deleteSession)

  // -- Local state --
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedResource, setSelectedResource] = useState<Resource | null>(null)
  const [isProfileLoading, setIsProfileLoading] = useState(true)
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [streamingText, setStreamingText] = useState('')
  const [currentPhase, setCurrentPhase] = useState('')
  const [agentStatus, setAgentStatus] = useState('')
  const [profileError, setProfileError] = useState<string | null>(null)
  const [goalInput, setGoalInput] = useState('')
  const [showGoalInput, setShowGoalInput] = useState(false)
  const [snapshot, setSnapshot] = useState<LearnerSnapshot | null>(null)

  // -- PPT interactive state --
  const [selectedHotspot, setSelectedHotspot] = useState<ConceptHotspot | null>(null)
  const [selectedCodeButton, setSelectedCodeButton] = useState<CodeButton | null>(null)
  const [showExtResources, setShowExtResources] = useState(false)

  const abortRef = useRef<AbortController | null>(null)

  // -- Resource decisions store --
  const recordResourceClick = useResourceDecisionsStore((s) => s.recordResourceClick)
  const recordResourceView = useResourceDecisionsStore((s) => s.recordResourceView)
  const recordQuizResult = useResourceDecisionsStore((s) => s.recordQuizResult)

  /** Open a resource in the viewer and record the click for feedback */
  const handleResourceClick = useCallback(
    (resource: Resource, nodeId: string) => {
      setSelectedResource(resource)
      if (currentSessionId) {
        recordResourceClick(currentSessionId, nodeId, resource.type)
      }
    },
    [currentSessionId, recordResourceClick],
  )

  /** Track how long the user viewed a resource (dwell time) */
  const handleResourceView = useCallback(
    (nodeId: string, type: ResourceType, dwellMs: number) => {
      if (currentSessionId) {
        recordResourceView(currentSessionId, nodeId, type, dwellMs)
      }
    },
    [currentSessionId, recordResourceView],
  )

  /** Close the resource viewer */
  const handleCloseResource = useCallback(() => {
    setSelectedResource(null)
  }, [])

  /** Handle concept hotspot click from PPT viewer */
  const handleHotspotClick = useCallback((hotspot: ConceptHotspot) => {
    setSelectedHotspot(hotspot)
    setSelectedCodeButton(null)
  }, [])

  /** Handle code button click from PPT viewer */
  const handleCodeButtonClick = useCallback((btn: CodeButton) => {
    setSelectedCodeButton(btn)
    setSelectedHotspot(null)
  }, [])

  /** Build headers for SSE fetch calls — includes auth token when available */
  const sseHeaders = (): Record<string, string> => {
    const token = getApiToken()
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }
  }

  // -- Refs for stale-closure prevention in SSE callbacks --
  const pathRef = useRef(path)
  useEffect(() => { pathRef.current = path }, [path])

  // -- Derived data --
  const nodes = path?.nodes ?? []
  const currentSession = getCurrentSession()
  const activeNode = nodes.find((n) => n.status === 'in_progress') ?? null
  const completedCount = nodes.filter((n) => n.status === 'completed').length
  const totalCount = nodes.length
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  // The node currently being viewed: prefer selectedNodeId, fallback to activeNode
  const viewingNode = (selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) : null) ?? activeNode

  // Resources for the viewing node
  const activeNodeResources = viewingNode
    ? resources.filter((r) =>
        viewingNode.resources?.some((ref) => ref.resourceId === r.id),
      )
    : []

  // PPT resource (main view) and non-PPT resources (extension panel)
  const pptResource = activeNodeResources.find((r) => r.type === 'ppt') ?? null
  const pptScenes = pptResource?.metadata?.pptData as Scene[] | undefined
  const nonPptResources = activeNodeResources.filter((r) => r.type !== 'ppt')

  /** Open a related resource from concept panel */
  const handleViewRelatedResource = useCallback((resourceId: string) => {
    const resource = resources.find((r) => r.id === resourceId)
    if (resource && viewingNode) {
      handleResourceClick(resource, viewingNode.id)
    }
  }, [resources, viewingNode, handleResourceClick])

  /** Handle quiz completion — feed result back into the decision engine */
  const handleQuizResult = useCallback(
    (resource: Resource, result: { score: number; completed: boolean }) => {
      if (currentSessionId && activeNode) {
        recordQuizResult(currentSessionId, activeNode.id, result.score, result.completed)
      }
    },
    [currentSessionId, activeNode, recordQuizResult],
  )

  const displayDimensions = profile
    ? computeDimensionScores(profile.dimensions)
    : []

  // -- Derived analytics from snapshot --
  const snapshotAccuracy = (() => {
    const sessions = snapshot?.recentSessions ?? []
    const allResults = sessions.flatMap((s) => s.quizResults)
    if (allResults.length === 0) return null
    const correct = allResults.filter((r) => r.correct).length
    return Math.round((correct / allResults.length) * 100)
  })()
  const weakTopicCount = snapshot?.analytics?.weakTopics?.length ?? 0

  // -- Computed stats --
  const stats = [
    { label: '掌握度', value: `${progressPercent}%`, color: 'text-[var(--success)]' },
    { label: '答题正确率', value: snapshotAccuracy != null ? `${snapshotAccuracy}%` : '暂无', color: 'text-[var(--primary)]' },
    { label: '已完成节点', value: completedCount, color: 'text-[var(--info)]' },
    { label: '薄弱知识点', value: weakTopicCount, color: 'text-[var(--warning)]' },
  ]

  // =========================================================================
  // Restore learning state from localStorage on mount
  // =========================================================================

  useEffect(() => {
    // zustand persist rehydration is async — wait one tick to ensure
    // localStorage data has been written into the store before reading.
    const timer = setTimeout(() => {
      const sid = useSessionsStore.getState().currentSessionId
      if (!sid) return

      // Restore the active learning path for the current session
      const currentPath = useLearningPathStore.getState().path
      if (!currentPath) {
        loadPathForSession(sid)
      }

      // Restore the active resources for the current session
      const currentResources = useResourcesStore.getState().resources
      if (currentResources.length === 0) {
        loadResourcesForSession(sid)
      }
    }, 0)

    return () => clearTimeout(timer)
  }, [loadPathForSession, loadResourcesForSession])

  // =========================================================================
  // Fetch profile on mount
  // =========================================================================

  useEffect(() => {
    let cancelled = false

    async function fetchProfile() {
      setIsProfileLoading(true)
      setProfileError(null)
      try {
        const data = await apiGet<LearnerSnapshot & {
          profile: {
            id: string | null
            userId: string
            version: number
            dimensions: ProfileDimensions
            isNew?: boolean
          }
        }>(`/api/v1/smartlearn/profile?userId=${userId}`)

        if (!cancelled) {
          setProfile({
            id: data.profile.id ?? 'remote',
            userId: data.profile.userId,
            version: data.profile.version ?? 0,
            dimensions: data.profile.dimensions,
            updatedAt: new Date().toISOString(),
            conversationHistory: [],
          })
          setSnapshot(data)
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : '加载画像失败'
          setProfileError(message)
        }
      } finally {
        if (!cancelled) setIsProfileLoading(false)
      }
    }

    fetchProfile()
    return () => { cancelled = true }
  }, [setProfile])

  // =========================================================================
  // SSE event processor
  // =========================================================================

  const processSSEEvent = useCallback(
    (event: SmartLearnStreamEvent) => {
      switch (event.type) {
        // -- Phase lifecycle --
        case 'stage_start':
          setCurrentPhase(event.content || event.stage)
          setAgentStatus(`正在${event.content || event.stage}...`)
          break

        case 'stage_end':
          setCurrentPhase('')
          setAgentStatus('')
          break

        // -- Streaming text --
        case 'content':
          setStreamingText((prev) => prev + event.content)
          break

        // -- Structured results --
        case 'result': {
          const meta = event.metadata
          const learnEventType = meta.learnEventType as string | undefined

          if (learnEventType === 'node_ready' && meta.node) {
            // A new learning node was generated — add to path
            const node = meta.node as LearningPathNode
            const currentPath = pathRef.current
            if (currentPath) {
              const exists = currentPath.nodes.some((n) => n.id === node.id)
              if (!exists) {
                setPath({
                  ...currentPath,
                  nodes: [...currentPath.nodes, node],
                  edges: currentPath.edges,
                  updatedAt: new Date().toISOString(),
                })
              }
            }
          }

          if (learnEventType === 'resource_delta' && meta.resource) {
            const resource = meta.resource as Resource
            addResource(resource)
          }

          if (learnEventType === 'ppt_ready' && meta.scenes) {
            // Backup handler: wrap PPT scenes as a Resource if resource_delta didn't arrive
            const scenes = meta.scenes as Scene[]
            const currentResources = useResourcesStore.getState().resources
            const existingPpt = currentResources.find((r) => r.type === 'ppt')
            if (!existingPpt && scenes.length > 0) {
              const kps = (meta.knowledgePoints as string[] | undefined) ?? []
              const pptResource: Resource = {
                id: generateId(),
                userId: (meta.userId as string) || 'local-admin',
                type: 'ppt',
                title: kps.length > 0 ? `${kps.join('、')} - 动态课件` : '动态课件',
                content: `PPT课件：共${scenes.length}页`,
                sourceAgent: 'ppt',
                status: 'ready',
                createdAt: new Date().toISOString(),
                metadata: { knowledgePoints: kps, pptData: scenes },
              }
              addResource(pptResource)
            }
          }

          if (learnEventType === 'path_update' && meta.path) {
            const serverPath = meta.path as import('@/lib/types/learning-path').LearningPath
            const currentPath = pathRef.current
            if (currentPath) {
              // Merge strategy: preserve client nodes that already have resources,
              // supplement with server nodes, prefer server data for overlapping nodes
              const serverNodeMap = new Map(serverPath.nodes.map((n) => [n.id, n]))
              const clientNodeMap = new Map(currentPath.nodes.map((n) => [n.id, n]))

              // Start with server nodes, then merge in any client nodes that server doesn't have
              const mergedNodes = [...serverPath.nodes]
              for (const [id, clientNode] of clientNodeMap) {
                if (!serverNodeMap.has(id)) {
                  mergedNodes.push(clientNode)
                } else {
                  // For overlapping nodes, if client has resources but server doesn't, preserve client resources
                  const serverNode = serverNodeMap.get(id)!
                  if (clientNode.resources.length > 0 && serverNode.resources.length === 0) {
                    const idx = mergedNodes.findIndex((n) => n.id === id)
                    if (idx !== -1) {
                      mergedNodes[idx] = { ...serverNode, resources: clientNode.resources }
                    }
                  }
                }
              }

              setPath({
                ...serverPath,
                nodes: mergedNodes,
              })
            } else {
              setPath(serverPath)
            }
          }

          if (learnEventType === 'evaluation_result' && meta.evaluation) {
            const evaluation = meta.evaluation as {
              feedback: string
              weakPoints: string[]
              strongPoints: string[]
              suggestedFocus: string[]
              profileUpdate: ProfileDimensions | null
            }
            setStreamingText((prev) =>
              prev + `\n\n--- 评估结果 ---\n${evaluation.feedback}\n`,
            )
            if (evaluation.profileUpdate) {
              updateDimensions(evaluation.profileUpdate)
            }
          }

          if (learnEventType === 'profile_update' && meta.dimensions) {
            updateDimensions(meta.dimensions as Partial<ProfileDimensions>)
          }
          break
        }

        // -- Agent progress --
        case 'progress':
          setAgentStatus(event.content)
          break

        // -- Error --
        case 'error':
          setError(event.content || '未知错误')
          break

        // -- Done --
        case 'done': {
          setIsStreaming(false)
          setAgentStatus('')
          setCurrentPhase('')
          // Auto-complete the active node when stream ends with resources generated
          const latestPath = pathRef.current
          const latestActiveNode = latestPath?.nodes.find((n) => n.status === 'in_progress')
          if (latestActiveNode && latestActiveNode.resources && latestActiveNode.resources.length > 0) {
            updateNodeStatus(latestActiveNode.id, 'completed')
          }
          break
        }

        default:
          // Ignore unknown event types
          break
      }
    },
    [setPath, addResource, updateDimensions, updateNodeStatus],
  )

  // =========================================================================
  // Start learning (SSE stream to /api/v1/smartlearn)
  // =========================================================================

  const handleStartLearning = async () => {
    setError(null)
    setStreamingText('')
    setSelectedNodeId(null) // Reset selection so viewingNode falls back to the new activeNode

    const profileDimensions = profile?.dimensions
    if (!profileDimensions) {
      setError('学习画像尚未加载，请稍后再试')
      return
    }

    // Use user input as goal, fall back to profile learning goals
    const goal = goalInput.trim()
      || profileDimensions.learningGoals.shortTerm[0]
      || profileDimensions.learningGoals.longTerm
      || '学习'

    // Create or reuse session
    let sessionId = currentSessionId
    if (!sessionId) {
      const session = createSession(profile?.id ?? userId, goal)
      sessionId = session.id
    }

    setGoalInput('')
    setIsStreaming(true)
    setPlanning(true)
    setStreamingText('')

    const abort = new AbortController()
    abortRef.current = abort

    try {
      // Auto-complete the active node before starting the next one
      // This ensures nodes with generated resources are marked completed
      const currentActiveNode = useLearningPathStore.getState().path?.nodes.find((n) => n.status === 'in_progress')
      if (currentActiveNode && currentActiveNode.resources && currentActiveNode.resources.length > 0) {
        updateNodeStatus(currentActiveNode.id, 'completed')
      }

      // Read the latest state after potential auto-complete
      const latestNodes = useLearningPathStore.getState().path?.nodes ?? []
      const completedNodes = latestNodes.filter((n) => n.status === 'completed')

      const res = await fetch('/api/v1/smartlearn', {
        method: 'POST',
        headers: sseHeaders(),
        body: JSON.stringify({
          action: 'start',
          sessionId,
          profile: profileDimensions,
          goal,
          completedNodes,
          currentNodeId: null,
        }),
        signal: abort.signal,
      })

      if (!res.ok) {
        let msg = `HTTP ${res.status}`
        try {
          const body = await res.json()
          msg = body.error ?? msg
        } catch {
          // not JSON
        }
        // If 401, the session has expired — redirect to login
        if (res.status === 401) {
          useAuthStore.getState().logout()
          router.push('/auth/login')
          throw new Error('登录已过期，请重新登录')
        }
        throw new Error(msg)
      }

      await consumeSSEStream(res, {
        onEvent: (rawEvent) => {
          const event = rawEvent as unknown as SmartLearnStreamEvent
          processSSEEvent(event)
        },
        onError: (err) => {
          if (!abort.signal.aborted) {
            setError(err.message || 'Stream error')
            setIsStreaming(false)
          }
        },
        signal: abort.signal,
      })
    } catch (err) {
      if (abort.signal.aborted) return
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
    } finally {
      setIsStreaming(false)
      setPlanning(false)
      abortRef.current = null
    }
  }

  // =========================================================================
  // Quiz evaluation
  // =========================================================================

  const handleQuizEvaluation = useCallback(
    async (quizResults: Array<{
      questionId: string
      question: string
      knowledgePoints: string[]
      correct: boolean
      userAnswer: string
      correctAnswer: string
      difficulty: number
    }>) => {
      if (!profile?.dimensions) return
      setError(null)
      setIsStreaming(true)
      setStreamingText('')

      const abort = new AbortController()
      abortRef.current = abort

      try {
        const completedNodes = nodes.filter((n) => n.status === 'completed')

        const res = await fetch('/api/v1/smartlearn/evaluate', {
          method: 'POST',
          headers: sseHeaders(),
          body: JSON.stringify({
            sessionId: currentSessionId,
            quizResults,
            profile: profile.dimensions,
            goal: currentSession?.goal ?? '',
            completedNodes,
            currentNodeId: activeNode?.id ?? null,
            currentNodeTitle: activeNode?.title ?? null,
          }),
          signal: abort.signal,
        })

        if (!res.ok) {
          let msg = `HTTP ${res.status}`
          try {
            const body = await res.json()
            msg = body.error ?? msg
          } catch {
            // not JSON
          }
          if (res.status === 401) {
            useAuthStore.getState().logout()
            router.push('/auth/login')
            throw new Error('登录已过期，请重新登录')
          }
          throw new Error(msg)
        }

        await consumeSSEStream(res, {
          onEvent: (rawEvent) => {
            const event = rawEvent as unknown as SmartLearnStreamEvent
            processSSEEvent(event)
          },
          onError: (err) => {
            if (!abort.signal.aborted) {
              setError(err.message || '评估流式传输错误')
              setIsStreaming(false)
            }
          },
          signal: abort.signal,
        })

        // Mark the active node as completed after successful evaluation
        if (activeNode) {
          updateNodeStatus(activeNode.id, 'completed')
        }
      } catch (err) {
        if (abort.signal.aborted) return
        const message = err instanceof Error ? err.message : String(err)
        setError(message)
      } finally {
        setIsStreaming(false)
        abortRef.current = null
      }
    },
    [profile, currentSessionId, currentSession, nodes, activeNode, processSSEEvent, updateNodeStatus],
  )

  // =========================================================================
  // Generate resources
  // =========================================================================

  const handleGenerateResources = useCallback(async () => {
    if (!profile?.dimensions) return
    setError(null)
    setIsStreaming(true)
    setStreamingText('')
    setAgentStatus('正在生成学习资源...')

    const abort = new AbortController()
    abortRef.current = abort

    try {
      // Ensure completedNodes includes all nodes with generated resources
      const latestNodes = useLearningPathStore.getState().path?.nodes ?? []
      const completedNodes = latestNodes.filter((n) => n.status === 'completed')
      const latestActiveNode = latestNodes.find((n) => n.status === 'in_progress') ?? activeNode

      const res = await fetch('/api/v1/smartlearn/resources', {
        method: 'POST',
        headers: sseHeaders(),
        body: JSON.stringify({
          sessionId: currentSessionId,
          profile: profile.dimensions,
          goal: currentSession?.goal ?? '',
          completedNodes,
          currentNodeId: latestActiveNode?.id ?? null,
          currentNodeTitle: latestActiveNode?.title ?? null,
        }),
        signal: abort.signal,
      })

      if (!res.ok) {
        let msg = `HTTP ${res.status}`
        try {
          const body = await res.json()
          msg = body.error ?? msg
        } catch {
          // not JSON
        }
        if (res.status === 401) {
          useAuthStore.getState().logout()
          router.push('/auth/login')
          throw new Error('登录已过期，请重新登录')
        }
        throw new Error(msg)
      }

      await consumeSSEStream(res, {
        onEvent: (rawEvent) => {
          const event = rawEvent as unknown as SmartLearnStreamEvent
          processSSEEvent(event)
        },
        onError: (err) => {
          if (!abort.signal.aborted) {
            setError(err.message || '资源生成流式传输错误')
            setIsStreaming(false)
          }
        },
        signal: abort.signal,
      })
    } catch (err) {
      if (abort.signal.aborted) return
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
    } finally {
      setIsStreaming(false)
      setAgentStatus('')
      abortRef.current = null
    }
  }, [profile, currentSessionId, currentSession, nodes, activeNode, processSSEEvent])

  // =========================================================================
  // Update profile dimensions via API
  // =========================================================================

  const handleUpdateProfile = useCallback(
    async (dimensions: Partial<ProfileDimensions>) => {
      try {
        const data = await apiPost<{
          profile: {
            id: string | null
            userId: string
            version: number
            dimensions: ProfileDimensions
          }
        }>('/api/v1/smartlearn/profile', {
          userId: userId,
          dimensions,
        })
        updateDimensions(data.profile.dimensions)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update profile'
        setError(message)
      }
    },
    [updateDimensions],
  )

  // =========================================================================
  // Reset
  // =========================================================================

  const handleReset = useCallback(() => {
    // Abort any active stream
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }

    // Clear stores
    pathReset()
    resourcesReset()

    // Clear local state
    setIsStreaming(false)
    setError(null)
    setStreamingText('')
    setCurrentPhase('')
    setAgentStatus('')
    setSelectedNodeId(null)
    setSelectedResource(null)

    // Delete session if exists
    if (currentSessionId) {
      deleteSession(currentSessionId)
    }
  }, [pathReset, resourcesReset, currentSessionId, deleteSession])

  // =========================================================================
  // Node selection
  // =========================================================================

  const handleNodeSelect = useCallback(
    (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId)
      if (!node || node.status === 'locked') return
      setSelectedNodeId(nodeId)
    },
    [nodes],
  )

  // =========================================================================
  // Cleanup on unmount
  // =========================================================================

  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort()
      }
    }
  }, [])

  // =========================================================================
  // Render helpers
  // =========================================================================

  // =========================================================================
  // Render
  // =========================================================================

  return (
    <div className="flex h-full bg-[var(--background)]">
      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-y-auto">
        {/* Header */}
        <div className="border-b border-[var(--border)] px-6 py-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h1 className="text-xl font-semibold text-[var(--foreground)]">
                {currentSession?.goal ?? '智能学习'}
                {totalCount > 0 && ` · 学习路径`}
              </h1>
              <p className="text-[13px] text-[var(--muted-foreground)] mt-1">
                {totalCount > 0
                  ? `${completedCount}/${totalCount} 节点完成 · 进度 ${progressPercent}%`
                  : isPlanning
                    ? '正在规划学习路径...'
                    : '输入你想学的内容，开始智能学习'}
              </p>
            </div>
            <div className="flex gap-2">
              {totalCount > 0 && !isStreaming && (
                <button
                  onClick={() => setShowGoalInput(!showGoalInput)}
                  className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-[var(--muted)] text-[var(--foreground)] border border-[var(--border)] hover:bg-[var(--accent)] transition-colors flex items-center gap-1.5"
                >
                  学点别的
                </button>
              )}
              <button
                onClick={handleReset}
                disabled={isStreaming}
                className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-[var(--muted)] text-[var(--foreground)] border border-[var(--border)] hover:bg-[var(--accent)] transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                重置
              </button>
              <button
                onClick={handleStartLearning}
                disabled={isStreaming || isProfileLoading}
                className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90 transition-opacity flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isStreaming ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
                {isStreaming ? '学习中...' : totalCount > 0 ? '继续' : '开始学习'}
              </button>
            </div>
          </div>

          {/* New goal input — shown when "学点别的" is clicked and there's an existing path */}
          {showGoalInput && totalCount > 0 && !isStreaming && (
            <div className="flex gap-2 mt-3">
              <input
                type="text"
                value={goalInput}
                onChange={(e) => setGoalInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && goalInput.trim()) {
                    handleReset()
                    setTimeout(() => handleStartLearning(), 0)
                    setShowGoalInput(false)
                  }
                }}
                placeholder="输入新的学习目标..."
                className="flex-1 px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] text-[13px] focus:outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] transition-colors"
              />
              <button
                onClick={() => {
                  if (goalInput.trim()) {
                    handleReset()
                    setTimeout(() => handleStartLearning(), 0)
                    setShowGoalInput(false)
                  }
                }}
                disabled={!goalInput.trim()}
                className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90 transition-opacity flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="h-3.5 w-3.5" />
                开始新学习
              </button>
            </div>
          )}

          {/* Agent status bar */}
          {agentStatus && (
            <div className="flex items-center gap-2 text-[12px] text-[var(--muted-foreground)] mt-2">
              <Loader2 className="h-3 w-3 animate-spin text-[var(--primary)]" />
              <span>{agentStatus}</span>
            </div>
          )}
        </div>

        {/* Error banner */}
        {error && (
          <div className="mx-6 mt-4 flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-4 py-3 text-[13px] text-red-700 dark:text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span className="flex-1">{error}</span>
            <button
              onClick={() => setError(null)}
              className="text-red-500 hover:text-red-700 text-xs"
            >
              关闭
            </button>
          </div>
        )}

        {/* Loading state while fetching profile */}
        {isProfileLoading && (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-[var(--primary)]" />
              <span className="text-[13px] text-[var(--muted-foreground)]">{i18n.t('common.loading')}</span>
            </div>
          </div>
        )}

        {/* Empty state — no path yet: show goal input */}
        {!isProfileLoading && nodes.length === 0 && !isStreaming && (
          <div className="flex-1 flex items-center justify-center px-6">
            <div className="text-center space-y-4 max-w-md w-full">
              {profileError ? (
                <>
                  <AlertCircle className="h-12 w-12 mx-auto text-[var(--warning)]" />
                  <h2 className="text-lg font-semibold text-[var(--foreground)]">
                    画像加载失败
                  </h2>
                  <p className="text-[13px] text-[var(--muted-foreground)]">
                    {profileError}
                  </p>
                  <button
                    onClick={() => window.location.reload()}
                    className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[var(--primary)] text-[var(--primary-foreground)]"
                  >
                    重试
                  </button>
                </>
              ) : (
                <>
                  <h2 className="text-lg font-semibold text-[var(--foreground)]">
                    你想学什么？
                  </h2>
                  <p className="text-[13px] text-[var(--muted-foreground)]">
                    AI 将根据你的学习画像，为你规划个性化学习路径并生成学习资源。
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={goalInput}
                      onChange={(e) => setGoalInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && goalInput.trim()) {
                          handleStartLearning()
                        }
                      }}
                      placeholder="例如：Python 机器学习、React 前端开发、高等数学..."
                      className="flex-1 px-4 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] text-[14px] focus:outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] transition-colors"
                    />
                    <button
                      onClick={handleStartLearning}
                      disabled={!goalInput.trim() || isProfileLoading}
                      className="px-4 py-2.5 rounded-lg text-[14px] font-medium bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90 transition-opacity flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Send className="h-4 w-4" />
                      开始
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Streaming text output */}
        {streamingText && (
          <div className="px-6 py-4 border-b border-[var(--border)]">
            <h3 className="text-[12px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wide mb-2">
              AI 输出
            </h3>
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
              <p className="text-[13px] text-[var(--foreground)] whitespace-pre-wrap leading-relaxed">
                {streamingText}
                {isStreaming && (
                  <span className="inline-block w-1.5 h-4 bg-[var(--primary)] animate-pulse ml-0.5 align-text-bottom" />
                )}
              </p>
            </div>
          </div>
        )}

        {/* Current Node Content */}
        {viewingNode && (
          <div className="flex-1 px-6 py-6 space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-[var(--foreground)] mb-1">
                当前节点：{viewingNode.title}
              </h2>
              <p className="text-[13px] text-[var(--muted-foreground)]">
                {activeNodeResources.length} 个学习资源
                {viewingNode.estimatedMinutes ? ` · 预计用时 ${viewingNode.estimatedMinutes} 分钟` : ''}
              </p>
            </div>

            {/* ── PPT 主视图模式 ── */}
            {pptResource && pptScenes && pptScenes.length > 0 ? (
              <div className="space-y-3">
                {/* PPT + 侧边面板 */}
                <div className="flex gap-0 rounded-xl border border-[var(--border)] overflow-hidden" style={{ minHeight: 480 }}>
                  {/* PPT 主画布 */}
                  <div className="flex-1 min-w-0 p-4 overflow-auto">
                    <PPTViewer
                      scenes={pptScenes}
                      onHotspotClick={handleHotspotClick}
                      onCodeButtonClick={handleCodeButtonClick}
                    />
                  </div>

                  {/* 侧边讲解面板 */}
                  {(selectedHotspot || selectedCodeButton) && (
                    <div className="w-80 shrink-0">
                      {selectedHotspot && (
                        <ConceptPanel
                          hotspot={selectedHotspot}
                          onClose={() => setSelectedHotspot(null)}
                          onViewRelatedResource={handleViewRelatedResource}
                        />
                      )}
                      {selectedCodeButton && (
                        <InlineCodeRunner
                          code={selectedCodeButton.code}
                          language={selectedCodeButton.language}
                          label={selectedCodeButton.label}
                          stdin={selectedCodeButton.stdin}
                          onClose={() => setSelectedCodeButton(null)}
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : activeNodeResources.length > 0 ? (
              /* ── 回退：资源网格模式 ── */
              <div className="grid grid-cols-2 gap-3">
                {activeNodeResources.map((resource) => {
                  const Icon = RESOURCE_ICON_MAP[resource.type] ?? FileText
                  return (
                    <button
                      key={resource.id}
                      onClick={() => handleResourceClick(resource, viewingNode!.id)}
                      className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 text-left hover:border-[var(--primary)] transition-colors group"
                    >
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-lg bg-[var(--muted)] group-hover:bg-[var(--primary)]/10 transition-colors">
                          <Icon className="h-4 w-4 text-[var(--primary)]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-[13px] font-medium text-[var(--foreground)] mb-1 line-clamp-2">
                            {resource.title}
                          </h3>
                          <span className="text-[11px] text-[var(--muted-foreground)]">
                            {RESOURCE_TYPE_LABELS[resource.type] ?? resource.type}
                          </span>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="text-center py-8">
                {isStreaming ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" />
                    <span className="text-[13px] text-[var(--muted-foreground)]">
                      正在生成资源...
                    </span>
                  </div>
                ) : (
                  <button
                    onClick={handleGenerateResources}
                    className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[var(--muted)] text-[var(--foreground)] border border-[var(--border)] hover:bg-[var(--accent)] transition-colors"
                  >
                    生成学习资源
                  </button>
                )}
              </div>
            )}

            {/* Node actions — only show for the active (in_progress) node */}
            {activeNode && activeNode.id === viewingNode?.id && activeNode.status === 'in_progress' && !isStreaming && (
              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleGenerateResources}
                  className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-[var(--muted)] text-[var(--foreground)] border border-[var(--border)] hover:bg-[var(--accent)] transition-colors"
                >
                  重新生成资源
                </button>
              </div>
            )}
          </div>
        )}

        {/* 知识路径条 — 页面底部 */}
        {viewingNode && path && path.nodes.length > 1 && (
          <div className="px-6 pb-6">
            <KnowledgeGraphBar
              nodes={path.nodes}
              activeNodeId={viewingNode.id}
              onNodeClick={handleNodeSelect}
            />
          </div>
        )}
      </div>

      {/* Floating Extension Resources Panel — premium FAB */}
      {nonPptResources.length > 0 && (
        <div className="fixed bottom-6 right-6 z-30">
          <Collapsible open={showExtResources} onOpenChange={setShowExtResources}>
            <CollapsibleTrigger asChild>
              <button className="group relative flex items-center gap-2 rounded-2xl bg-gradient-brand px-5 py-3 text-[14px] font-semibold text-white shadow-[0_8px_30px_-6px_rgba(37,99,235,0.5)] transition-all duration-300 hover:shadow-[0_12px_40px_-6px_rgba(37,99,235,0.6)] hover:scale-[1.03] active:scale-[0.97]">
                {/* Subtle glow ring */}
                <span className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-white/20" />
                {/* Animated shimmer overlay */}
                <span className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-r from-transparent via-white/10 to-transparent bg-[length:200%_100%] animate-[shimmer_3s_ease-in-out_infinite] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <BookOpen className="h-4.5 w-4.5 shrink-0 drop-shadow-sm" />
                <span>扩展资源</span>
                <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white/25 px-1.5 text-[11px] font-bold backdrop-blur-sm">
                  {nonPptResources.length}
                </span>
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-3 w-80 max-h-96 overflow-auto rounded-2xl border border-blue-100/60 bg-white/95 backdrop-blur-xl shadow-[0_20px_60px_-15px_rgba(37,99,235,0.25),0_0_0_1px_rgba(255,255,255,0.1)] p-2 space-y-1">
                {/* Panel header */}
                <div className="flex items-center gap-2 px-3 pb-2 pt-1">
                  <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-pastel-blue">
                    <BookOpen className="h-3.5 w-3.5" />
                  </div>
                  <span className="text-[12px] font-semibold text-[var(--foreground)]">扩展学习资源</span>
                  <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">{nonPptResources.length} 项</span>
                </div>
                <div className="h-px bg-gradient-to-r from-transparent via-[var(--border)] to-transparent" />
                {/* Resource list */}
                <div className="space-y-0.5 pt-1">
                  {nonPptResources.map((r) => {
                    const Icon = RESOURCE_ICON_MAP[r.type] ?? FileText
                    return (
                      <button
                        key={r.id}
                        onClick={() => viewingNode && handleResourceClick(r, viewingNode.id)}
                        className="group/item w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-blue-50/70 transition-all duration-200"
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-pastel-blue transition-colors group-hover/item:bg-blue-100">
                          <Icon className="h-4 w-4 text-blue-600" />
                        </div>
                        <span className="text-[12.5px] font-medium text-[var(--foreground)] line-clamp-1 group-hover/item:text-blue-700 transition-colors">{r.title}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}

      {/* Resource Viewer Modal Overlay */}
      {selectedResource && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={handleCloseResource}
          />
          {/* Modal content */}
          <div className="relative z-10 h-[90vh] w-[90vw] max-w-5xl rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-2xl flex flex-col overflow-hidden">
            {/* Modal header with close button */}
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2">
              <span className="text-[13px] font-medium text-[var(--muted-foreground)]">
                {RESOURCE_TYPE_LABELS[selectedResource.type]} · {selectedResource.title}
              </span>
              <button
                onClick={handleCloseResource}
                className="rounded-lg p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {/* Viewer content */}
            <div className="flex-1 overflow-hidden">
              <ResourceViewer
                resource={selectedResource}
                sessionId={currentSessionId}
                nodeId={viewingNode?.id ?? selectedNodeId}
                onQuizResult={handleQuizResult}
                onResourceView={handleResourceView}
                onRegenerate={undefined}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
