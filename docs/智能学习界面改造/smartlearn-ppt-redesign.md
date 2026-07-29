## SmartLearn 交互式课件改造方案

### 目标

将智能学习的主展示界面从"资源卡片列表 + 独立查看器"改造为**以动态课件（PPT）为核心的一体化学习界面**：PPT 中提到的概念词可点击展开讲解文档，代码/算法讲解可一键跳转 Sandbox 运行，开篇嵌入本课知识图谱并随学习进度高亮当前节点。原有的文档、思维导图、拓展阅读等资源收纳进"扩展资源"面板。

---

### 一、整体布局变化

**当前布局**：顶部水平节点时间线（圆形按钮排列）→ 下方两列资源网格（ResourceGrid 展示当前节点的资源卡片）→ 点击资源卡片弹出全屏模态遮罩层（`fixed inset-0 z-50`）内嵌 ResourceViewer 按类型分发渲染。注意：`components/workspace/learning-path-panel.tsx`（280px 左侧栏）虽然已实现但当前未被 `page.tsx` 引用。

**目标布局**：

```
┌─────────────────────────────────────────────────────┐
│  [知识图谱条]  ← PPT第一页，简洁拓扑，当前节点高亮     │
├──────────────────────────────┬──────────────────────┤
│                              │  侧边讲解面板         │
│   PPT 主画布 (SlidePreview)  │  (概念卡片 / 代码沙盒) │
│   ← 支持 spotlight/laser 等  │  点击PPT中的热区触发   │
│                              │                      │
├──────────────────────────────┴──────────────────────┤
│  [场景导航] + [扩展资源按钮 ▸]                        │
└─────────────────────────────────────────────────────┘
```

核心改动：PPT 从"资源类型之一"升级为"主视图"，其他资源类型变为 PPT 的附属面板。

---

### 二、需要修改的文件清单

| 文件 | 改动 |
|---|---|
| `app/smartlearn/page.tsx` | 主布局重构：PPT 作为默认展示，资源卡片改为"扩展资源"抽屉 |
| `components/workspace/ppt-viewer.tsx` | 增加概念热区点击回调、代码跳转按钮、知识图谱首页场景 |
| `components/workspace/resource-viewer.tsx` | 降级为"扩展资源面板"内嵌组件（注意：ResourceViewer 本身只是类型分发器，当前无全屏逻辑，全屏由 page.tsx 的模态遮罩实现，故此处主要是去掉错误/重试横幅等冗余 UI） |
| `lib/learning-graph/helpers/ppt-generator.ts` | 生成时注入 concept hotspots 和 code buttons 到 Scene 数据 |
| `lib/learning-graph/helpers/resource-generators.ts` | PPT 生成时同时产出配套的 concept snippets 和 code snippets |
| `lib/types/stage.ts` | 类型扩展：`SlideSceneContent` 新增 `codeButtons` 字段 |
| `lib/types/slides.ts` | 类型扩展：`PPTBaseElement` 新增 `hotspots` 字段 |
| `lib/types/action.ts` | 新增 `open-concept` 和 `run-code` 两种 Action 类型 |
| `components/workspace/concept-panel.tsx` | **新文件** — 侧边概念讲解面板 |
| `components/workspace/inline-code-runner.tsx` | **新文件** — 嵌入式代码沙盒（复用 `components/resources/code-runner.tsx` 的核心逻辑，复用 `/api/v1/code/execute`） |
| `components/workspace/knowledge-graph-bar.tsx` | **新文件** — 简洁知识图谱条 |

---

### 三、各模块实现要点

#### 3.1 知识图谱条（Knowledge Graph Bar）

**位置**：PPT 场景序列的第一页（`order: 0`），或在 PPT 上方作为固定条。

**数据来源**：`LearningPathNode.knowledgePoints` 已经是现成的。每个节点有 2-4 个知识点，节点间有 `prerequisites` 依赖。

**实现**：
- 从当前 `path.nodes` 提取所有 `knowledgePoints`，去重后构建一个有向无环图
- 用纯 SVG（不需要引入 markmap 等重依赖）渲染简洁拓扑：节点为圆角矩形，边为灰色连线
- 当前正在学习的节点高亮（`primary` 色 + 脉冲动画），已完成节点为绿色填充，未解锁节点为灰色
- 点击节点跳转到对应 PPT 场景（通过 `knowledgePoints` 匹配 `Scene.title`）

**数据结构**（无需新建，直接复用）：
```ts
// 从 path.nodes 派生
interface KGNode { id: string; label: string; status: 'completed' | 'active' | 'locked' }
interface KGEdge { from: string; to: string }
```

#### 3.2 概念热区（Concept Hotspot）

**PPT 数据注入**：在 `ppt-generator.ts` 的 `generatePptScenes` 流程中，对每个生成的 slide Scene，扫描其 `canvas.elements` 中的文本元素。对文本中出现的知识点关键词（从 `currentNode.knowledgePoints` 取），在元素数据上追加 `hotspots` 标记：

```ts
// 扩展 PPTBaseElement（lib/types/slides.ts）
// 注意：PPTElement 实际定义为 type PPTElement = PPTBaseElement & Record<string, unknown>
// 建议在 PPTBaseElement 上添加 hotspots，使所有子类型（PPTTextElement 等）均可使用
interface PPTBaseElement {
  // ...existing fields
  hotspots?: Array<{
    keyword: string;        // 匹配的概念词
    snippet: string;        // 200字以内的概念讲解（LLM 在 PPT 生成时一并产出）
    relatedResourceId?: string; // 关联的扩展资源（document/reading）
  }>;
}
```

**前端交互**：
- `ppt-viewer.tsx` 中 `SlidePreview` 渲染文本元素时，对含 `hotspots` 的文本做关键词高亮（下划线 + 小图标）
- 点击高亮词 → 右侧 `ConceptPanel` 滑出，展示 snippet 内容
- 面板底部有"查看完整文档"按钮 → 如果有 `relatedResourceId`，在扩展资源面板中打开对应文档

**snippet 生成**：在 `resource-generators.ts` 的 PPT 生成流程末尾，加一步 LLM 调用：
```
系统提示：你是概念讲解助手。请为以下知识点各生成50-200字的简明讲解。
用户输入：知识点列表 + PPT 上下文
输出：JSON { keyword: string, snippet: string }[]
```

#### 3.3 嵌入式代码运行（Inline Code Runner）

**PPT 数据注入**：对于知识点包含编程相关关键词（复用 `resource-decision.ts` 已有的代码关键词列表）的节点，PPT 生成时在对应 slide 中嵌入 code button 元素：

```ts
// Scene 扩展字段（lib/types/stage.ts）
// 注意：Scene 的 content 字段是判别联合类型 SlideSceneContent | QuizSceneContent | ...
// codeButtons 应加到 SlideSceneContent（即 SlideSceneContent 接口）上而非 Scene 本身
interface SlideSceneContent {
  // ...existing fields (slide: Slide, etc.)
  codeButtons?: Array<{
    id: string;
    label: string;         // "运行示例：快速排序"
    language: string;       // python / javascript
    code: string;           // 预生成的完整可运行代码
    stdin?: string;
  }>;
}
```

**前端交互**：
- `ppt-viewer.tsx` 检测到 `scene.content.codeButtons`（仅 slide 类型场景）时，在 slide 底部渲染一行按钮
- 点击按钮 → 右侧面板切换为 `InlineCodeRunner`（复用 `components/resources/code-runner.tsx` 的核心逻辑，但去掉 Card 包装，直接嵌入侧边栏）
- 代码运行走已有的 `/api/v1/code/execute`（Piston Sandbox），无需新建 API

**code snippet 生成**：在 PPT 生成的 LLM 提示词中，要求对涉及算法/代码的 slide 同时产出一段可运行的示例代码（10-30 行），附在 outline 的 metadata 中。

#### 3.4 扩展资源面板

**改动最小**：将当前 `smartlearn/page.tsx` 中的资源卡片列表从主视图区域移到右下角的一个可折叠抽屉/Popover 中。

```tsx
// smartlearn/page.tsx 中
<div className="fixed bottom-4 right-4 z-30">
  <Collapsible>
    <CollapsibleTrigger asChild>
      <Button variant="outline" size="sm">
        扩展资源 ({activeNodeResources.length})
      </Button>
    </CollapsibleTrigger>
    <CollapsibleContent>
      <div className="w-80 max-h-96 overflow-auto rounded-lg border bg-background shadow-lg p-3">
        {activeNodeResources.map(r => (
          <ResourceCard key={r.id} resource={r} onClick={() => handleResourceClick(r, activeNode.id)} />
        ))}
      </div>
    </CollapsibleContent>
  </Collapsible>
</div>
```

PPT 类型资源不在此列表中出现（因为它已经是主视图）。

#### 3.5 PPT 生成优化

当前 `ppt-generator.ts` 的流程是 `generateSceneOutlinesFromRequirements`（outline 生成）→ 可选 `batchGenerateImages`（批量图片生成，依赖 image provider 配置）→ 串行 `for...of` 循环调用 `buildSceneFromOutline`（内部含 scene content 生成 + scene actions 生成两步 LLM 调用）。优化方向：

1. **概念热区和代码按钮随 PPT 一起生成**：在 `generateSceneOutlinesFromRequirements` 的 prompt 中增加要求，让 LLM 在 outline 阶段就标注哪些文本元素是概念热区、哪些 slide 需要代码按钮。这避免了后处理扫描的不准确性。

2. **首页知识图谱场景**：在 outline 结果前手动插入一个 `type: 'interactive'` 的 Scene（`order: 0`），其 `html` 字段由前端知识图谱组件的 `renderToString` 产出，或者直接让 PPT viewer 在 `currentIndex === 0` 时渲染 `KnowledgeGraphBar` 组件而非普通 slide。

3. **并行生成**：当前 `buildSceneFromOutline` 是串行 `for...of`，可改为 `Promise.all` 并行生成各场景内容（图片生成已经是批量的，不受影响）。

---

### 四、数据流变化

```
generate-resources.ts
  ├── ppt-generator.ts
  │   ├── outline (含 hotspot 标注 + code button 标注)  ← 修改 prompt
  │   ├── images (可选，依赖 image provider)              ← batchGenerateImages
  │   ├── scene content (每个 slide 带 hotspots 和 codeButtons)
  │   ├── concept snippets (LLM 批量生成)                 ← 新增
  │   └── scene actions (spotlight/laser 等，不变)
  │
  ├── document / mindmap / quiz / reading / code / video  ← 不变，照常生成
  │
  └── 最终 Resource[] 中：
      - ppt 资源 → 主视图（Scene[] 含 hotspots + codeButtons）
      - 其他资源 → 扩展资源面板
```

前端渲染流程：

```
smartlearn/page.tsx
  ├── activeNode 有 ppt 资源？
  │   ├── 是 → 渲染 PPTViewer（主视图）+ ConceptPanel（侧边）+ KnowledgeGraphBar（顶部/首页）
  │   └── 否 → 回退到当前 ResourceViewer 逻辑
  │
  └── 右下角始终显示"扩展资源"浮动按钮（含资源数量 badge）
```

---

### 五、实施步骤（建议顺序）

1. **扩展类型定义**（`stage.ts` 的 `SlideSceneContent` + `slides.ts` 的 `PPTBaseElement` + `action.ts`）— 加 hotspots、codeButtons 字段，改动小且无副作用
2. **新建三个组件**（`concept-panel.tsx`、`inline-code-runner.tsx`、`knowledge-graph-bar.tsx`）— 纯 UI，可独立开发和测试
3. **修改 `ppt-viewer.tsx`** — 接入概念热区渲染和代码按钮渲染
4. **修改 `ppt-generator.ts` + `resource-generators.ts`** — prompt 改造，注入 hotspot/code 生成逻辑
5. **修改 `smartlearn/page.tsx`** — 布局重构，PPT 为主视图，资源收纳进扩展面板
6. **修改 `resource-viewer.tsx`** — 去掉独立全屏逻辑，作为扩展面板的内嵌组件

---

### 六、注意事项

- **向后兼容**：PPT 资源如果没有 `hotspots` 和 `codeButtons`（旧数据），前端应正常降级为当前的纯 slide 展示
- **Sandbox 依赖**：代码运行依赖 Piston API（`getSandboxService()`），需确保环境已配置；如果 sandbox 不可用，code button 应显示为"代码预览"模式（只读展示代码，不可运行）
- **知识图谱简洁性**：只展示当前 path 的知识点拓扑（通常 3-8 个节点），不做全局知识图谱，避免视觉复杂
- **性能**：concept snippet 和 code snippet 的 LLM 生成应与 PPT scene 生成并行（`Promise.all`），不额外增加等待时间
