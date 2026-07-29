import { createLogger } from '@/lib/logger';
import type { VideoSource } from '@/lib/types/resource';

const log = createLogger('BilibiliSearch');

export interface BilibiliSearchOptions {
  maxResults?: number;
  order?: 'totalrank' | 'click' | 'pubdate';
  duration?: number;
}

interface BilibiliSearchResultItem {
  bvid?: string;
  arcurl?: string;
  title?: string;
  description?: string;
  pic?: string;
  duration?: string;
  author?: string;
  upic?: string;
  play?: number | string;
  pubdate?: number;
  tag?: string;
}

interface BilibiliSearchApiResponse {
  code?: number;
  message?: string;
  data?: {
    result?: BilibiliSearchResultItem[];
  };
}

function looksLikeHtml(text: string): boolean {
  return /^\s*<!doctype html/i.test(text) || /^\s*<html/i.test(text);
}

function decodeHtml(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function normalizeImageUrl(url?: string): string {
  if (!url) return '';
  if (url.startsWith('//')) return `https:${url}`;
  return url;
}

function normalizeCount(value?: string | number): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return undefined;

  const cleaned = value.replace(/,/g, '').trim();
  if (!cleaned) return undefined;

  const wanMatch = cleaned.match(/^([\d.]+)万$/);
  if (wanMatch) {
    const parsed = Number(wanMatch[1]);
    return Number.isFinite(parsed) ? Math.round(parsed * 10_000) : undefined;
  }

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizePublishedAt(timestamp?: number): string | undefined {
  if (!timestamp) return undefined;
  return new Date(timestamp * 1000).toISOString();
}

function tokenize(text: string): string[] {
  return Array.from(
    new Set(
      text
        .split(/\s+/)
        .map((token) => token.trim())
        .filter(Boolean),
    ),
  );
}

function computeMatchedKeywords(title: string, description: string, queryTokens: string[]): string[] {
  const haystack = `${title} ${description}`.toLowerCase();
  return queryTokens.filter((token) => haystack.includes(token.toLowerCase()));
}

function computeRelevanceScore(matchedKeywords: string[], queryTokens: string[]): number {
  if (queryTokens.length === 0) return 0;
  return Math.min(1, matchedKeywords.length / queryTokens.length);
}

export function extractBvid(url: string): string | null {
  const match = url.match(/\/(BV[0-9A-Za-z]+)(?:\/?|\?|$)/i);
  return match?.[1] ?? null;
}

export function buildBilibiliEmbedUrl(bvid: string, page?: number): string {
  return `https://player.bilibili.com/player.html?bvid=${bvid}&autoplay=0&high_quality=1${page ? `&page=${page}` : ''}`;
}

function toVideoSource(
  item: BilibiliSearchResultItem,
  index: number,
  queryTokens: string[],
): VideoSource | null {
  const url = item.arcurl || (item.bvid ? `https://www.bilibili.com/video/${item.bvid}` : '');
  const bvid = item.bvid || extractBvid(url);
  if (!url || !bvid) return null;

  const title = decodeHtml(item.title || `B站视频 ${index + 1}`);
  const description = decodeHtml(item.description || '');
  const matchedKeywords = computeMatchedKeywords(title, description, queryTokens);

  return {
    id: bvid,
    title,
    description,
    url,
    embedUrl: buildBilibiliEmbedUrl(bvid),
    coverImageUrl: normalizeImageUrl(item.pic),
    duration: item.duration,
    author: item.author,
    authorAvatar: normalizeImageUrl(item.upic),
    viewCount: normalizeCount(item.play),
    platform: 'bilibili',
    publishedAt: normalizePublishedAt(item.pubdate),
    relevanceScore: computeRelevanceScore(matchedKeywords, queryTokens),
    matchedKeywords,
    tags: item.tag
      ? item.tag
          .split(',')
          .map((tag: string) => tag.trim())
          .filter(Boolean)
      : undefined,
  };
}

export async function searchBilibiliVideos(
  query: string,
  options: BilibiliSearchOptions = {},
): Promise<VideoSource[]> {
  const maxResults = options.maxResults ?? 5;
  const searchParams = new URLSearchParams({
    keyword: query,
    search_type: 'video',
    page: '1',
    page_size: String(maxResults),
    order: options.order ?? 'totalrank',
  });

  if (typeof options.duration === 'number') {
    searchParams.set('duration', String(options.duration));
  }

  const headers: HeadersInit = {
    Accept: 'application/json',
    'User-Agent': 'Mozilla/5.0',
    Referer: 'https://www.bilibili.com',
  };

  const cookie = process.env.VIDEO_SEARCH_BILIBILI_COOKIE;
  if (cookie) {
    headers.Cookie = cookie;
  }

  const response = await fetch(`https://api.bilibili.com/x/web-interface/wbi/search/type?${searchParams.toString()}`, {
    headers,
    cache: 'no-store',
  });

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(`Bilibili search failed: ${response.status}`);
  }

  if (looksLikeHtml(responseText)) {
    throw new Error('Bilibili search returned HTML instead of JSON');
  }

  const payload = JSON.parse(responseText) as BilibiliSearchApiResponse;
  if (payload.code && payload.code !== 0) {
    throw new Error(payload.message || `Bilibili search error code ${payload.code}`);
  }

  const queryTokens = tokenize(query);

  return (payload.data?.result ?? [])
    .map((item, index) => toVideoSource(item, index, queryTokens))
    .filter((item): item is VideoSource => Boolean(item));
}

export async function searchBilibiliVideosSafe(
  query: string,
  options: BilibiliSearchOptions = {},
): Promise<VideoSource[]> {
  try {
    return await searchBilibiliVideos(query, options);
  } catch (error) {
    log.warn('Bilibili search failed', error);
    return [];
  }
}
