/**
 * Dynamic Theme System — Selects color schemes based on subject/topic
 *
 * Instead of a single hardcoded theme, the system matches the course
 * topic to a discipline and picks an appropriate palette.
 */

import type { SlideTheme, SlideBackground } from '@/lib/types/slides';
import { createLogger } from '@/lib/logger';
const log = createLogger('SlideThemes');

// ── Theme definition ──

export interface SlideThemePreset {
  id: string;
  name: string;
  subjects: string[];   // Keywords to match against topic/title
  theme: SlideTheme;
  defaultBackground: SlideBackground;
}

// ── Theme presets ──

const THEME_PRESETS: SlideThemePreset[] = [
  // 科技 / 计算机
  {
    id: 'tech',
    name: '科技蓝',
    subjects: ['编程', '代码', '算法', '计算机', '软件', '人工智能', 'AI', '机器学习', '深度学习', '数据结构', '网络', '云计算', '编程', 'python', 'java', 'javascript', 'typescript', 'react', 'vue', 'node', 'api', 'docker', 'git', 'linux', '数据库', '前端', '后端', '开发', '技术', 'IT', '互联网', 'web'],
    theme: {
      backgroundColor: '#f0f4ff',
      themeColors: ['#3b82f6', '#06b6d4', '#8b5cf6', '#10b981', '#f59e0b'],
      fontColor: '#1e293b',
      fontName: 'Microsoft YaHei',
      outline: { color: '#3b82f6', width: 2, style: 'solid' as const },
      shadow: { h: 0, v: 0, blur: 10, color: '#000000' },
    },
    defaultBackground: { type: 'solid', color: '#f0f4ff' },
  },
  // 数学 / 物理
  {
    id: 'math',
    name: '数学紫',
    subjects: ['数学', '代数', '几何', '微积分', '概率', '统计', '线性代数', '离散', '数论', '物理', '力学', '电学', '光学', '热学', '量子', '相对论', '公式', '方程', '函数'],
    theme: {
      backgroundColor: '#faf5ff',
      themeColors: ['#7c3aed', '#a78bfa', '#6366f1', '#818cf8', '#c084fc'],
      fontColor: '#1e1b4b',
      fontName: 'Microsoft YaHei',
      outline: { color: '#7c3aed', width: 2, style: 'solid' as const },
      shadow: { h: 0, v: 0, blur: 10, color: '#000000' },
    },
    defaultBackground: { type: 'solid', color: '#faf5ff' },
  },
  // 化学 / 生物
  {
    id: 'science',
    name: '科学绿',
    subjects: ['化学', '有机', '无机', '分子', '反应', '元素', '生物', '细胞', '基因', 'DNA', '生态', '进化', '植物', '动物', '微生物', '蛋白质', '酶', '医学', '药', '健康', '解剖'],
    theme: {
      backgroundColor: '#f0fdf4',
      themeColors: ['#16a34a', '#22c55e', '#059669', '#34d399', '#84cc16'],
      fontColor: '#14532d',
      fontName: 'Microsoft YaHei',
      outline: { color: '#16a34a', width: 2, style: 'solid' as const },
      shadow: { h: 0, v: 0, blur: 10, color: '#000000' },
    },
    defaultBackground: { type: 'solid', color: '#f0fdf4' },
  },
  // 历史 / 人文
  {
    id: 'humanities',
    name: '人文棕',
    subjects: ['历史', '文明', '朝代', '战争', '革命', '文化', '哲学', '思想', '文学', '诗歌', '小说', '艺术', '音乐', '绘画', '建筑', '考古', '宗教', '社会', '政治', '法律', '经济'],
    theme: {
      backgroundColor: '#fefce8',
      themeColors: ['#b45309', '#d97706', '#92400e', '#ca8a04', '#a16207'],
      fontColor: '#422006',
      fontName: 'Microsoft YaHei',
      outline: { color: '#b45309', width: 2, style: 'solid' as const },
      shadow: { h: 0, v: 0, blur: 10, color: '#000000' },
    },
    defaultBackground: { type: 'solid', color: '#fefce8' },
  },
  // 语言 / 英语
  {
    id: 'language',
    name: '语言橙',
    subjects: ['英语', '语文', '阅读', '写作', '语法', '词汇', '翻译', '口语', '听力', '雅思', '托福', 'GRE', '四六级', '汉字', '古文', '作文', '散文', '戏剧', '修辞'],
    theme: {
      backgroundColor: '#fff7ed',
      themeColors: ['#ea580c', '#f97316', '#fb923c', '#c2410c', '#9a3412'],
      fontColor: '#431407',
      fontName: 'Microsoft YaHei',
      outline: { color: '#ea580c', width: 2, style: 'solid' as const },
      shadow: { h: 0, v: 0, blur: 10, color: '#000000' },
    },
    defaultBackground: { type: 'solid', color: '#fff7ed' },
  },
  // 商业 / 管理
  {
    id: 'business',
    name: '商务深蓝',
    subjects: ['商业', '管理', '营销', '金融', '投资', '创业', '企业', '战略', '领导', '市场', '品牌', '财务', '会计', '人力', '项目', '运营', 'MBA', '商务'],
    theme: {
      backgroundColor: '#f8fafc',
      themeColors: ['#1e40af', '#3b82f6', '#1d4ed8', '#2563eb', '#60a5fa'],
      fontColor: '#0f172a',
      fontName: 'Microsoft YaHei',
      outline: { color: '#1e40af', width: 2, style: 'solid' as const },
      shadow: { h: 0, v: 0, blur: 10, color: '#000000' },
    },
    defaultBackground: { type: 'solid', color: '#f8fafc' },
  },
  // 地理 / 环境
  {
    id: 'earth',
    name: '地球青',
    subjects: ['地理', '气候', '环境', '海洋', '地质', '地形', '地图', '气象', '天文', '宇宙', '太阳系', '星球', '环保', '生态', '可持续发展'],
    theme: {
      backgroundColor: '#ecfeff',
      themeColors: ['#0891b2', '#06b6d4', '#0e7490', '#22d3ee', '#67e8f9'],
      fontColor: '#083344',
      fontName: 'Microsoft YaHei',
      outline: { color: '#0891b2', width: 2, style: 'solid' as const },
      shadow: { h: 0, v: 0, blur: 10, color: '#000000' },
    },
    defaultBackground: { type: 'solid', color: '#ecfeff' },
  },
  // 教育 / 心理
  {
    id: 'education',
    name: '教育粉',
    subjects: ['教育', '教学', '学习', '心理', '认知', '发展', '儿童', '青少年', '课堂', '课程', '考试', '培训', '辅导', '记忆', '思维'],
    theme: {
      backgroundColor: '#fdf2f8',
      themeColors: ['#db2777', '#ec4899', '#be185d', '#f472b6', '#9333ea'],
      fontColor: '#500724',
      fontName: 'Microsoft YaHei',
      outline: { color: '#db2777', width: 2, style: 'solid' as const },
      shadow: { h: 0, v: 0, blur: 10, color: '#000000' },
    },
    defaultBackground: { type: 'solid', color: '#fdf2f8' },
  },
];

// ── Default fallback theme (original) ──

const DEFAULT_THEME: SlideTheme = {
  backgroundColor: '#ffffff',
  themeColors: ['#5b9bd5', '#ed7d31', '#a5a5a5', '#ffc000', '#4472c4'],
  fontColor: '#333333',
  fontName: 'Microsoft YaHei',
  outline: { color: '#d14424', width: 2, style: 'solid' as const },
  shadow: { h: 0, v: 0, blur: 10, color: '#000000' },
};

const DEFAULT_BACKGROUND: SlideBackground = { type: 'solid', color: '#ffffff' };

// ── Public API ──

/**
 * Select a theme preset based on the course topic and scene titles.
 * Uses keyword matching to find the best-matching discipline.
 */
export function selectThemeForTopic(topic: string, sceneTitles?: string[]): SlideThemePreset | null {
  const text = [topic, ...(sceneTitles || [])].join(' ').toLowerCase();

  let bestMatch: SlideThemePreset | null = null;
  let bestScore = 0;

  for (const preset of THEME_PRESETS) {
    let score = 0;
    for (const keyword of preset.subjects) {
      if (text.includes(keyword.toLowerCase())) {
        score += 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = preset;
    }
  }

  if (bestMatch && bestScore > 0) {
    log.info(`Theme "${bestMatch.name}" selected for topic "${topic}" (score: ${bestScore})`);
    return bestMatch;
  }

  log.debug(`No specific theme matched for topic "${topic}", using default`);
  return null;
}

/**
 * Get the SlideTheme for a given topic.
 * Returns the matched preset theme or the default theme.
 */
export function getThemeForTopic(topic: string, sceneTitles?: string[]): SlideTheme {
  const preset = selectThemeForTopic(topic, sceneTitles);
  return preset?.theme ?? DEFAULT_THEME;
}

/**
 * Get the default background for a given topic.
 * Returns the matched preset background or the default.
 */
export function getDefaultBackgroundForTopic(topic: string, sceneTitles?: string[]): SlideBackground {
  const preset = selectThemeForTopic(topic, sceneTitles);
  return preset?.defaultBackground ?? DEFAULT_BACKGROUND;
}

/**
 * Get all available theme presets (for UI display or manual selection).
 */
export function getAllThemePresets(): SlideThemePreset[] {
  return [...THEME_PRESETS];
}

export { DEFAULT_THEME, DEFAULT_BACKGROUND };
