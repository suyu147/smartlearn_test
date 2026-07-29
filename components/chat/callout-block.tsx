'use client';

import { cn } from '@/lib/utils';
import { AlertTriangle, BookOpen, CheckCircle, Info, Lightbulb, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';

type CalloutType = 'note' | 'tip' | 'warning' | 'danger' | 'info' | 'success';

interface CalloutConfig {
  icon: ReactNode;
  label: string;
  containerClass: string;
  iconClass: string;
}

const CALLOUT_CONFIG: Record<CalloutType, CalloutConfig> = {
  note: {
    icon: <Info className="h-4 w-4" />,
    label: '注意',
    containerClass: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200',
    iconClass: 'text-blue-600 dark:text-blue-400',
  },
  tip: {
    icon: <Lightbulb className="h-4 w-4" />,
    label: '提示',
    containerClass: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
    iconClass: 'text-emerald-600 dark:text-emerald-400',
  },
  warning: {
    icon: <AlertTriangle className="h-4 w-4" />,
    label: '警告',
    containerClass: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200',
    iconClass: 'text-amber-600 dark:text-amber-400',
  },
  danger: {
    icon: <XCircle className="h-4 w-4" />,
    label: 'Danger',
    containerClass: 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200',
    iconClass: 'text-red-600 dark:text-red-400',
  },
  info: {
    icon: <BookOpen className="h-4 w-4" />,
    label: 'Info',
    containerClass: 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200',
    iconClass: 'text-sky-600 dark:text-sky-400',
  },
  success: {
    icon: <CheckCircle className="h-4 w-4" />,
    label: 'Success',
    containerClass: 'border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200',
    iconClass: 'text-green-600 dark:text-green-400',
  },
};

function parseCalloutType(title: string): CalloutType {
  const lower = title.toLowerCase().trim();
  if (lower === 'tip') return 'tip';
  if (lower === 'warning' || lower === 'warn') return 'warning';
  if (lower === 'danger' || lower === 'caution') return 'danger';
  if (lower === 'info') return 'info';
  if (lower === 'success' || lower === 'check') return 'success';
  return 'note';
}

interface CalloutBlockProps {
  type?: CalloutType;
  title?: string;
  children: ReactNode;
}

export function CalloutBlock({ type, title, children }: CalloutBlockProps) {
  const calloutType = type ?? (title ? parseCalloutType(title) : 'note');
  const config = CALLOUT_CONFIG[calloutType];

  return (
    <div className={cn('my-3 rounded-lg border p-3', config.containerClass)}>
      <div className="flex items-start gap-2">
        <span className={cn('mt-0.5 shrink-0', config.iconClass)}>{config.icon}</span>
        <div className="min-w-0 flex-1 text-sm">
          {title && (
            <p className="mb-1 font-semibold">{title}</p>
          )}
          <div className="[&_p]:m-0 [&_ul]:m-0 [&_ol]:m-0">{children}</div>
        </div>
      </div>
    </div>
  );
}

export { parseCalloutType, type CalloutType };
