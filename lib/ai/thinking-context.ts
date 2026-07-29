import { AsyncLocalStorage } from 'node:async_hooks';
import type { ThinkingConfig } from '@/lib/types/provider';

export const thinkingContext = new AsyncLocalStorage<ThinkingConfig | undefined>();
