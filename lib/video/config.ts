export interface VideoSearchConfig {
  local: {
    enabled: boolean;
    dbPath?: string;
    vectorSearchEnabled: boolean;
    maxResults: number;
  };
  bilibili: {
    enabled: boolean;
    cookie?: string;
    maxResults: number;
    defaultOrder: 'totalrank' | 'click' | 'pubdate';
  };
  maxTotalResults: number;
  searchTimeout: number;
}

export const defaultVideoSearchConfig: VideoSearchConfig = {
  local: {
    enabled: true,
    dbPath: process.env.VIDEO_SEARCH_LOCAL_DB_PATH,
    vectorSearchEnabled: false,
    maxResults: 5,
  },
  bilibili: {
    enabled: process.env.VIDEO_SEARCH_BILIBILI_ENABLED !== 'false',
    cookie: process.env.VIDEO_SEARCH_BILIBILI_COOKIE,
    maxResults: 5,
    defaultOrder: 'totalrank',
  },
  maxTotalResults: Number(process.env.VIDEO_SEARCH_MAX_RESULTS || 10),
  searchTimeout: 10000,
};
