'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  forceX,
  forceY,
  type Simulation,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from 'd3-force';
import { select } from 'd3-selection';
import { zoom, zoomIdentity, type ZoomBehavior } from 'd3-zoom';
import { ArrowLeft, Search } from 'lucide-react';
import Link from 'next/link';

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

type NodeCategory = 'knowledge' | 'micro' | 'chapter' | 'path' | 'lab';

interface GraphNode extends SimulationNodeDatum {
  id: string;
  label: string;
  category: NodeCategory;
  radius: number;
}

interface GraphLink extends SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
}

// ---------------------------------------------------------------------------
// Category config
// ---------------------------------------------------------------------------

const categoryConfig: Record<NodeCategory, { label: string; color: string }> = {
  knowledge: { label: '知识点', color: '#5b7ff5' },
  micro: { label: '微课', color: '#4caf82' },
  chapter: { label: '章节', color: '#e87fa0' },
  path: { label: '学习路径', color: '#5bc0de' },
  lab: { label: '实验', color: '#e85d5d' },
};

// ---------------------------------------------------------------------------
// Static graph data — ML / DL / NN theme
// ---------------------------------------------------------------------------

function buildGraphData(): { nodes: GraphNode[]; links: GraphLink[] } {
  const nodes: GraphNode[] = [
    // ─── Core knowledge (large) ───
    { id: 'ml', label: '机器学习', category: 'knowledge', radius: 38 },
    { id: 'dl', label: '深度学习', category: 'knowledge', radius: 34 },
    { id: 'nn', label: '神经网络', category: 'knowledge', radius: 32 },

    // ─── DL sub-fields ───
    { id: 'cnn', label: '卷积神经网络CNN', category: 'knowledge', radius: 26 },
    { id: 'rnn', label: '循环神经网络RNN', category: 'knowledge', radius: 24 },
    { id: 'lstm', label: 'LSTM', category: 'knowledge', radius: 20 },
    { id: 'gan', label: 'GAN', category: 'knowledge', radius: 22 },
    { id: 'transformer', label: 'Transformer架构', category: 'knowledge', radius: 26 },
    { id: 'attention', label: '注意力机制', category: 'knowledge', radius: 22 },
    { id: 'autoencoder', label: '自编码器', category: 'knowledge', radius: 18 },
    { id: 'diffusion', label: '扩散模型', category: 'knowledge', radius: 20 },

    // ─── ML fundamentals ───
    { id: 'supervised', label: '监督学习', category: 'knowledge', radius: 22 },
    { id: 'unsupervised', label: '无监督学习', category: 'knowledge', radius: 20 },
    { id: 'reinforcement', label: '强化学习', category: 'knowledge', radius: 22 },
    { id: 'regression', label: '回归分析', category: 'knowledge', radius: 18 },
    { id: 'classification', label: '分类算法', category: 'knowledge', radius: 18 },
    { id: 'clustering', label: '聚类算法', category: 'knowledge', radius: 18 },
    { id: 'svm', label: '支持向量机', category: 'knowledge', radius: 16 },
    { id: 'decision-tree', label: '决策树', category: 'knowledge', radius: 16 },
    { id: 'random-forest', label: '随机森林', category: 'knowledge', radius: 16 },
    { id: 'ensemble', label: '集成学习', category: 'knowledge', radius: 18 },
    { id: 'bayesian', label: '贝叶斯方法', category: 'knowledge', radius: 16 },
    { id: 'knn', label: 'K近邻', category: 'knowledge', radius: 14 },
    { id: 'pca', label: 'PCA降维', category: 'knowledge', radius: 15 },

    // ─── Training & optimization ───
    { id: 'backprop', label: '反向传播', category: 'knowledge', radius: 20 },
    { id: 'gradient', label: '梯度下降', category: 'knowledge', radius: 20 },
    { id: 'optimizer', label: '优化器Adam', category: 'knowledge', radius: 16 },
    { id: 'regularization', label: '正则化', category: 'knowledge', radius: 16 },
    { id: 'dropout', label: 'Dropout', category: 'knowledge', radius: 14 },
    { id: 'batchnorm', label: '批归一化', category: 'knowledge', radius: 14 },
    { id: 'loss-fn', label: '损失函数', category: 'knowledge', radius: 18 },
    { id: 'overfitting', label: '过拟合与欠拟合', category: 'knowledge', radius: 16 },
    { id: 'cross-val', label: '交叉验证', category: 'knowledge', radius: 14 },
    { id: 'feature-eng', label: '特征工程', category: 'knowledge', radius: 16 },
    { id: 'transfer', label: '迁移学习', category: 'knowledge', radius: 18 },

    // ─── NLP ───
    { id: 'nlp', label: '自然语言处理', category: 'knowledge', radius: 24 },
    { id: 'bert', label: 'BERT', category: 'knowledge', radius: 18 },
    { id: 'gpt', label: 'GPT系列', category: 'knowledge', radius: 20 },
    { id: 'word2vec', label: 'Word2Vec', category: 'knowledge', radius: 15 },
    { id: 'tokenization', label: '分词技术', category: 'knowledge', radius: 14 },
    { id: 'llm', label: '大语言模型', category: 'knowledge', radius: 24 },
    { id: 'rlhf', label: 'RLHF', category: 'knowledge', radius: 16 },
    { id: 'prompt', label: '提示工程', category: 'knowledge', radius: 15 },

    // ─── CV ───
    { id: 'cv', label: '计算机视觉', category: 'knowledge', radius: 24 },
    { id: 'img-cls', label: '图像分类', category: 'knowledge', radius: 16 },
    { id: 'obj-det', label: '目标检测', category: 'knowledge', radius: 18 },
    { id: 'segmentation', label: '图像分割', category: 'knowledge', radius: 16 },
    { id: 'resnet', label: 'ResNet', category: 'knowledge', radius: 16 },
    { id: 'yolo', label: 'YOLO', category: 'knowledge', radius: 16 },
    { id: 'vit', label: 'ViT', category: 'knowledge', radius: 16 },
    { id: 'multimodal', label: '多模态融合', category: 'knowledge', radius: 18 },

    // ─── Math foundations ───
    { id: 'linear-algebra', label: '线性代数', category: 'knowledge', radius: 18 },
    { id: 'probability', label: '概率论', category: 'knowledge', radius: 18 },
    { id: 'calculus', label: '微积分', category: 'knowledge', radius: 16 },
    { id: 'info-theory', label: '信息论', category: 'knowledge', radius: 14 },

    // ─── Tools & frameworks ───
    { id: 'pytorch', label: 'PyTorch', category: 'knowledge', radius: 18 },
    { id: 'tensorflow', label: 'TensorFlow', category: 'knowledge', radius: 18 },
    { id: 'python', label: 'Python基础', category: 'knowledge', radius: 20 },
    { id: 'numpy', label: 'NumPy', category: 'knowledge', radius: 14 },
    { id: 'huggingface', label: 'HuggingFace', category: 'knowledge', radius: 16 },
    { id: 'mlops', label: 'MLOps', category: 'knowledge', radius: 16 },
    { id: 'xai', label: '可解释AI', category: 'knowledge', radius: 15 },

    // ─── Chapters (pink) ───
    { id: 'ch-intro', label: '第一章 绪论', category: 'chapter', radius: 16 },
    { id: 'ch-models', label: '第二章 经典模型', category: 'chapter', radius: 16 },
    { id: 'ch-nn', label: '第三章 神经网络', category: 'chapter', radius: 16 },
    { id: 'ch-applications', label: '第四章 应用实战', category: 'chapter', radius: 16 },

    // ─── Micro-lectures (green) ───
    { id: 'micro-nn-intro', label: '神经网络入门', category: 'micro', radius: 14 },
    { id: 'micro-cnn', label: 'CNN原理精讲', category: 'micro', radius: 14 },
    { id: 'micro-transformer', label: 'Transformer详解', category: 'micro', radius: 14 },
    { id: 'micro-gan', label: 'GAN实战演练', category: 'micro', radius: 13 },
    { id: 'micro-rl', label: '强化学习导论', category: 'micro', radius: 13 },
    { id: 'micro-bert', label: 'BERT微调实践', category: 'micro', radius: 13 },

    // ─── Learning paths (light blue) ───
    { id: 'path-beginner', label: '入门路径', category: 'path', radius: 15 },
    { id: 'path-advanced', label: '进阶路径', category: 'path', radius: 15 },
    { id: 'path-research', label: '科研路径', category: 'path', radius: 14 },

    // ─── Labs (red) ───
    { id: 'lab-mnist', label: 'MNIST手写识别', category: 'lab', radius: 13 },
    { id: 'lab-style', label: '风格迁移实验', category: 'lab', radius: 13 },
    { id: 'lab-chatbot', label: '对话机器人', category: 'lab', radius: 13 },
    { id: 'lab-detection', label: '目标检测实训', category: 'lab', radius: 13 },
  ];

  const links: GraphLink[] = [
    // Core hierarchy
    { source: 'ml', target: 'dl' },
    { source: 'ml', target: 'supervised' },
    { source: 'ml', target: 'unsupervised' },
    { source: 'ml', target: 'reinforcement' },
    { source: 'dl', target: 'nn' },
    { source: 'dl', target: 'cnn' },
    { source: 'dl', target: 'rnn' },
    { source: 'dl', target: 'gan' },
    { source: 'dl', target: 'transformer' },
    { source: 'dl', target: 'autoencoder' },
    { source: 'dl', target: 'diffusion' },

    // NN details
    { source: 'nn', target: 'backprop' },
    { source: 'nn', target: 'gradient' },
    { source: 'nn', target: 'loss-fn' },
    { source: 'rnn', target: 'lstm' },
    { source: 'transformer', target: 'attention' },
    { source: 'transformer', target: 'vit' },

    // Supervised
    { source: 'supervised', target: 'regression' },
    { source: 'supervised', target: 'classification' },
    { source: 'supervised', target: 'svm' },
    { source: 'supervised', target: 'decision-tree' },
    { source: 'decision-tree', target: 'random-forest' },
    { source: 'random-forest', target: 'ensemble' },
    { source: 'supervised', target: 'bayesian' },
    { source: 'supervised', target: 'knn' },

    // Unsupervised
    { source: 'unsupervised', target: 'clustering' },
    { source: 'unsupervised', target: 'pca' },
    { source: 'unsupervised', target: 'autoencoder' },

    // Training & optimization
    { source: 'gradient', target: 'optimizer' },
    { source: 'backprop', target: 'gradient' },
    { source: 'dl', target: 'regularization' },
    { source: 'regularization', target: 'dropout' },
    { source: 'regularization', target: 'batchnorm' },
    { source: 'ml', target: 'overfitting' },
    { source: 'overfitting', target: 'cross-val' },
    { source: 'ml', target: 'feature-eng' },
    { source: 'dl', target: 'transfer' },

    // NLP
    { source: 'dl', target: 'nlp' },
    { source: 'nlp', target: 'bert' },
    { source: 'nlp', target: 'gpt' },
    { source: 'nlp', target: 'word2vec' },
    { source: 'nlp', target: 'tokenization' },
    { source: 'nlp', target: 'llm' },
    { source: 'llm', target: 'rlhf' },
    { source: 'llm', target: 'prompt' },
    { source: 'llm', target: 'gpt' },
    { source: 'transformer', target: 'bert' },
    { source: 'transformer', target: 'gpt' },
    { source: 'reinforcement', target: 'rlhf' },

    // CV
    { source: 'dl', target: 'cv' },
    { source: 'cv', target: 'img-cls' },
    { source: 'cv', target: 'obj-det' },
    { source: 'cv', target: 'segmentation' },
    { source: 'cnn', target: 'resnet' },
    { source: 'obj-det', target: 'yolo' },
    { source: 'cv', target: 'multimodal' },
    { source: 'transformer', target: 'multimodal' },

    // Math
    { source: 'ml', target: 'linear-algebra' },
    { source: 'ml', target: 'probability' },
    { source: 'ml', target: 'calculus' },
    { source: 'probability', target: 'bayesian' },
    { source: 'probability', target: 'info-theory' },
    { source: 'calculus', target: 'gradient' },
    { source: 'linear-algebra', target: 'pca' },

    // Tools
    { source: 'dl', target: 'pytorch' },
    { source: 'dl', target: 'tensorflow' },
    { source: 'ml', target: 'python' },
    { source: 'python', target: 'numpy' },
    { source: 'nlp', target: 'huggingface' },
    { source: 'bert', target: 'huggingface' },
    { source: 'ml', target: 'mlops' },
    { source: 'ml', target: 'xai' },
    { source: 'pytorch', target: 'python' },

    // Chapters
    { source: 'ch-intro', target: 'ml' },
    { source: 'ch-intro', target: 'python' },
    { source: 'ch-models', target: 'supervised' },
    { source: 'ch-models', target: 'unsupervised' },
    { source: 'ch-nn', target: 'nn' },
    { source: 'ch-nn', target: 'cnn' },
    { source: 'ch-nn', target: 'rnn' },
    { source: 'ch-applications', target: 'nlp' },
    { source: 'ch-applications', target: 'cv' },

    // Micro-lectures
    { source: 'micro-nn-intro', target: 'nn' },
    { source: 'micro-cnn', target: 'cnn' },
    { source: 'micro-transformer', target: 'transformer' },
    { source: 'micro-gan', target: 'gan' },
    { source: 'micro-rl', target: 'reinforcement' },
    { source: 'micro-bert', target: 'bert' },

    // Learning paths
    { source: 'path-beginner', target: 'ml' },
    { source: 'path-beginner', target: 'python' },
    { source: 'path-beginner', target: 'supervised' },
    { source: 'path-advanced', target: 'dl' },
    { source: 'path-advanced', target: 'transformer' },
    { source: 'path-advanced', target: 'gan' },
    { source: 'path-research', target: 'llm' },
    { source: 'path-research', target: 'diffusion' },
    { source: 'path-research', target: 'multimodal' },

    // Labs
    { source: 'lab-mnist', target: 'cnn' },
    { source: 'lab-mnist', target: 'pytorch' },
    { source: 'lab-style', target: 'cnn' },
    { source: 'lab-style', target: 'transfer' },
    { source: 'lab-chatbot', target: 'llm' },
    { source: 'lab-chatbot', target: 'huggingface' },
    { source: 'lab-detection', target: 'yolo' },
    { source: 'lab-detection', target: 'obj-det' },
  ];

  return { nodes, links };
}

// ---------------------------------------------------------------------------
// Force Graph Component
// ---------------------------------------------------------------------------

function ForceGraph({
  nodes,
  links,
  searchTerm,
}: {
  nodes: GraphNode[];
  links: GraphLink[];
  searchTerm: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const simRef = useRef<Simulation<GraphNode, GraphLink> | null>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [, setTick] = useState(0);

  // Initialize simulation
  useEffect(() => {
    const width = svgRef.current?.clientWidth || 1200;
    const height = svgRef.current?.clientHeight || 800;

    const sim = forceSimulation<GraphNode>(nodes)
      .force(
        'link',
        forceLink<GraphNode, GraphLink>(links)
          .id((d) => d.id)
          .distance((d) => {
            const s = d.source as GraphNode;
            const t = d.target as GraphNode;
            const sr = typeof s.radius === 'number' ? s.radius : 16;
            const tr = typeof t.radius === 'number' ? t.radius : 16;
            return sr + tr + 40;
          })
          .strength(0.3),
      )
      .force('charge', forceManyBody().strength(-320).distanceMax(500))
      .force('center', forceCenter(width / 2, height / 2).strength(0.05))
      .force('collision', forceCollide<GraphNode>().radius((d) => d.radius + 8).strength(0.8))
      .force('x', forceX(width / 2).strength(0.03))
      .force('y', forceY(height / 2).strength(0.03))
      .alphaDecay(0.02)
      .velocityDecay(0.4);

    sim.on('tick', () => setTick((t) => t + 1));
    simRef.current = sim;

    return () => {
      sim.stop();
    };
  }, [nodes, links]);

  // Setup zoom
  useEffect(() => {
    if (!svgRef.current || !gRef.current) return;

    const zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 4])
      .on('zoom', (event) => {
        if (gRef.current) {
          select(gRef.current).attr('transform', event.transform.toString());
        }
      });

    select(svgRef.current).call(zoomBehavior);
    // Set initial transform to center
    select(svgRef.current).call(
      zoomBehavior.transform,
      zoomIdentity.translate(0, 0).scale(1),
    );
    zoomRef.current = zoomBehavior;

    return () => {
      if (svgRef.current) {
        select(svgRef.current).on('.zoom', null);
      }
    };
  }, []);

  // Drag state (React pointer events instead of d3-drag)
  const dragNodeRef = useRef<GraphNode | null>(null);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, node: GraphNode) => {
      e.stopPropagation();
      (e.target as Element).setPointerCapture(e.pointerId);
      dragNodeRef.current = node;
      simRef.current?.alphaTarget(0.3).restart();
      node.fx = node.x;
      node.fy = node.y;
    },
    [],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const node = dragNodeRef.current;
      if (!node || !svgRef.current) return;
      // Convert screen coords to SVG coords accounting for zoom transform
      const svg = svgRef.current;
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const gEl = gRef.current;
      if (gEl) {
        const ctm = gEl.getScreenCTM();
        if (ctm) {
          const svgPt = pt.matrixTransform(ctm.inverse());
          node.fx = svgPt.x;
          node.fy = svgPt.y;
        }
      }
    },
    [],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      const node = dragNodeRef.current;
      if (!node) return;
      (e.target as Element).releasePointerCapture(e.pointerId);
      simRef.current?.alphaTarget(0);
      node.fx = null;
      node.fy = null;
      dragNodeRef.current = null;
    },
    [],
  );

  // Determine if a node matches search
  const matchesSearch = useCallback(
    (node: GraphNode) => {
      if (!searchTerm.trim()) return true;
      return node.label.toLowerCase().includes(searchTerm.toLowerCase());
    },
    [searchTerm],
  );

  const hasSearch = searchTerm.trim().length > 0;

  return (
    <svg
      ref={svgRef}
      className="h-full w-full"
      style={{ background: '#fafbfe' }}
    >
      <g ref={gRef}>
        {/* Links */}
        {links.map((link, i) => {
          const s = link.source as GraphNode;
          const t = link.target as GraphNode;
          if (!s.x || !s.y || !t.x || !t.y) return null;
          const dimmed = hasSearch && !matchesSearch(s) && !matchesSearch(t);
          return (
            <line
              key={`link-${i}`}
              x1={s.x}
              y1={s.y}
              x2={t.x}
              y2={t.y}
              stroke={dimmed ? '#e8ecf2' : '#c5cfe0'}
              strokeWidth={dimmed ? 0.5 : 1}
              strokeOpacity={dimmed ? 0.3 : 0.6}
            />
          );
        })}

        {/* Nodes */}
        {nodes.map((node) => {
          if (node.x == null || node.y == null) return null;
          const color = categoryConfig[node.category].color;
          const matched = matchesSearch(node);
          const dimmed = hasSearch && !matched;
          const highlighted = hasSearch && matched;

          return (
            <g
              key={node.id}
              transform={`translate(${node.x},${node.y})`}
              onPointerDown={(e) => handlePointerDown(e, node)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              style={{ cursor: 'grab' }}
            >
              {/* Glow for highlighted */}
              {highlighted && (
                <circle
                  r={node.radius + 6}
                  fill="none"
                  stroke={color}
                  strokeWidth={2.5}
                  strokeOpacity={0.4}
                />
              )}
              {/* Main circle */}
              <circle
                className="node-circle"
                r={node.radius}
                fill={dimmed ? '#e8ecf2' : color}
                fillOpacity={dimmed ? 0.4 : 0.85}
                stroke={dimmed ? '#d0d7e2' : '#fff'}
                strokeWidth={dimmed ? 1 : 2}
                style={{ transition: 'fill-opacity 0.3s' }}
              />
              {/* Label */}
              <text
                textAnchor="middle"
                dy="0.35em"
                fontSize={Math.max(9, Math.min(node.radius * 0.55, 13))}
                fontWeight={node.radius > 24 ? 600 : 400}
                fill={dimmed ? '#a0aab8' : '#1a1a2e'}
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {node.label.length > 8 && node.radius < 20
                  ? node.label.slice(0, 7) + '…'
                  : node.label}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function KnowledgeGraphPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const { nodes, links } = useMemo(() => buildGraphData(), []);

  return (
    <div className="flex h-full flex-col bg-[#fafbfe]">
      {/* Header */}
      <div className="flex items-center gap-4 border-b border-gray-100 bg-white px-6 py-3.5 shadow-sm">
        <Link
          href="/home"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition-colors hover:bg-blue-50 hover:text-blue-600"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-[16px] font-bold text-gray-800">知识图谱</h1>
          <p className="text-[11px] text-gray-400">机器学习 · 深度学习 · 神经网络 知识体系</p>
        </div>
      </div>

      {/* Toolbar: search + legend */}
      <div className="flex flex-wrap items-center gap-4 border-b border-gray-100 bg-white px-6 py-2.5">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="搜索知识点…"
            className="h-8 w-52 rounded-lg border border-gray-200 bg-gray-50 pl-8 pr-3 text-[13px] text-gray-700 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100"
          />
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-[12px] text-gray-600">
          {Object.entries(categoryConfig).map(([key, cfg]) => (
            <span key={key} className="flex items-center gap-1.5">
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ backgroundColor: cfg.color }}
              />
              {cfg.label}
            </span>
          ))}
        </div>
      </div>

      {/* Graph area */}
      <div className="relative flex-1 overflow-hidden">
        <ForceGraph nodes={nodes} links={links} searchTerm={searchTerm} />

        {/* Hint */}
        <div className="pointer-events-none absolute bottom-4 left-4 rounded-lg bg-white/80 px-3 py-1.5 text-[11px] text-gray-400 shadow-sm backdrop-blur-sm">
          滚轮缩放 · 拖拽画布平移 · 拖拽节点调整位置
        </div>
      </div>
    </div>
  );
}
