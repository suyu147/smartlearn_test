'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/hooks/use-i18n'
import { UserCircle, Type, Globe, Volume2 } from 'lucide-react'

interface ToggleFieldProps {
  label: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
}

function ToggleField({ label, description, checked, onChange }: ToggleFieldProps) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-[var(--border)] p-4 bg-[var(--card)]">
      <div className="space-y-0.5">
        <p className="text-[13px] font-medium text-[var(--foreground)]">{label}</p>
        <p className="text-[12px] text-[var(--muted-foreground)]">{description}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-6 w-11 rounded-full transition-colors',
          checked ? 'bg-[var(--primary)]' : 'bg-[var(--muted)]'
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform',
            checked && 'translate-x-5'
          )}
        />
      </button>
    </div>
  )
}

export default function PersonaSettingsPage() {
  const { t } = useI18n()
  const [personaName, setPersonaName] = useState('SmartLearn Assistant')
  const [personaDescription, setPersonaDescription] = useState(
    '一位博学且有耐心的学习伴侣，能适应您的学习风格和节奏。'
  )
  const [communicationStyle, setCommunicationStyle] = useState('friendly')
  const [language, setLanguage] = useState('auto')
  const [verbosity, setVerbosity] = useState('balanced')
  const [useEmoji, setUseEmoji] = useState(false)
  const [showReasoning, setShowReasoning] = useState(true)
  const [proactiveTips, setProactiveTips] = useState(true)

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[var(--foreground)] mb-1">
          <UserCircle className="inline h-5 w-5 mr-2 -mt-0.5" />
          人格与风格设置
        </h1>
        <p className="text-[13px] text-[var(--muted-foreground)]">
          自定义助手的人格、语气和沟通偏好。
        </p>
      </div>

      <div className="space-y-4">
        {/* Persona Identity */}
        <div className="space-y-2">
          <label className="text-[13px] font-medium text-[var(--foreground)] flex items-center gap-1.5">
            <UserCircle className="h-3.5 w-3.5" />
            人格名称
          </label>
          <input
            type="text"
            value={personaName}
            onChange={(e) => setPersonaName(e.target.value)}
            placeholder="例如，小智、学习伙伴"
            className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-[13.5px] text-[var(--foreground)] outline-none focus:border-[var(--primary)] placeholder:text-[var(--muted-foreground)]"
          />
        </div>

        <div className="space-y-2">
          <label className="text-[13px] font-medium text-[var(--foreground)]">人格描述</label>
          <textarea
            value={personaDescription}
            onChange={(e) => setPersonaDescription(e.target.value)}
            rows={3}
            placeholder="描述助手的人格、专业领域和行为方式..."
            className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-[13.5px] text-[var(--foreground)] outline-none focus:border-[var(--primary)] resize-none placeholder:text-[var(--muted-foreground)]"
          />
          <p className="text-[11px] text-[var(--muted-foreground)]">
            此描述将注入到系统提示中以引导助手的行为。
          </p>
        </div>

        {/* Communication Style */}
        <div className="space-y-2">
          <label className="text-[13px] font-medium text-[var(--foreground)] flex items-center gap-1.5">
            <Type className="h-3.5 w-3.5" />
            沟通风格
          </label>
          <select
            value={communicationStyle}
            onChange={(e) => setCommunicationStyle(e.target.value)}
            className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-[13.5px] text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
          >
            <option value="formal">正式 - 专业且结构化的语言</option>
            <option value="casual">随意 - 轻松且对话式语气</option>
            <option value="academic">学术 - 学术严谨并附引用</option>
            <option value="friendly">友好 - 温暖且鼓励的方式</option>
          </select>
        </div>

        {/* Language Preference */}
        <div className="space-y-2">
          <label className="text-[13px] font-medium text-[var(--foreground)] flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5" />
            语言偏好
          </label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-[13.5px] text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
          >
            <option value="auto">自动检测（匹配用户语言）</option>
            <option value="en">English</option>
            <option value="zh-CN">Chinese (Simplified)</option>
            <option value="zh-TW">Chinese (Traditional)</option>
            <option value="ja">Japanese</option>
            <option value="ko">Korean</option>
            <option value="es">Spanish</option>
            <option value="fr">French</option>
            <option value="de">German</option>
          </select>
        </div>

        {/* Response Verbosity */}
        <div className="space-y-2">
          <label className="text-[13px] font-medium text-[var(--foreground)] flex items-center gap-1.5">
            <Volume2 className="h-3.5 w-3.5" />
            回复详细程度
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { value: 'concise', label: '简洁', desc: '简短、切中要点的回答' },
              { value: 'balanced', label: '均衡', desc: '适度详细并提供上下文' },
              { value: 'detailed', label: '详细', desc: '全面、深入的回答' },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => setVerbosity(opt.value)}
                className={cn(
                  'rounded-lg border p-3 text-center transition-colors',
                  verbosity === opt.value
                    ? 'border-[var(--primary)] bg-[var(--primary)]/5'
                    : 'border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)]'
                )}
              >
                <p className="text-[13px] font-medium text-[var(--foreground)]">{opt.label}</p>
                <p className="text-[11px] text-[var(--muted-foreground)] mt-0.5">{opt.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Toggles */}
        <div className="space-y-3 pt-2">
          <ToggleField
            checked={useEmoji}
            onChange={setUseEmoji}
            label="在回复中使用表情符号"
            description="添加相关表情符号使回复更具视觉吸引力"
          />
          <ToggleField
            checked={showReasoning}
            onChange={setShowReasoning}
            label="显示推理过程"
            description="在给出答案前展示逐步思考过程"
          />
          <ToggleField
            checked={proactiveTips}
            onChange={setProactiveTips}
            label="主动学习提示"
            description="建议相关主题和后续问题以加深理解"
          />
        </div>
      </div>

      <div className="flex gap-3 mt-6">
        <button className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90 transition-opacity">
          {t('settingsNav.applyChanges')}
        </button>
        <button
          onClick={() => {
            setPersonaName('SmartLearn Assistant')
            setPersonaDescription('一位博学且有耐心的学习伴侣，能适应您的学习风格和节奏。')
            setCommunicationStyle('friendly')
            setLanguage('auto')
            setVerbosity('balanced')
            setUseEmoji(false)
            setShowReasoning(true)
            setProactiveTips(true)
          }}
          className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[var(--muted)] text-[var(--foreground)] border border-[var(--border)] hover:bg-[var(--accent)] transition-colors"
        >
          恢复默认
        </button>
      </div>
    </div>
  )
}
