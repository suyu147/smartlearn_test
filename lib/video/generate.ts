export interface VideoGenerationResult {
  script: string;
  coverImageUrl?: string;
  scenes: Array<{
    title: string;
    description: string;
    narration: string;
    duration: number;
    style?: string;
  }>;
  style?: string;
}

export async function generateVideoCover(_prompt: string, _apiKey?: string): Promise<string | null> {
  return null;
}

export function parseVideoScript(script: string): VideoGenerationResult {
  const scenes: VideoGenerationResult['scenes'] = [];
  const sceneRegex = /(?:场景|Scene)\s*(\d+)\s*[：:]\s*\n((?:(?!(?:场景|Scene)\s*\d+\s*[：:]).+\n?)+)/gi;
  let match;
  let globalStyle = '';

  while ((match = sceneRegex.exec(script)) !== null) {
    const block = match[1] ? match[2] : match[0];
    const titleMatch = block.match(/(?:标题|Title)[：:]\s*(.+)/i);
    const descMatch = block.match(/(?:描述|Description)[：:]\s*(.+)/i);
    const narrMatch = block.match(/(?:旁白|Narration)[：:]\s*(.+)/i);
    const durMatch = block.match(/(?:时长|Duration)[：:]\s*(\d+)/i);
    const styleMatch = block.match(/(?:风格|Style)[：:]\s*(.+)/i);

    const style = styleMatch?.[1]?.trim() || '';
    if (style && !globalStyle) {
      globalStyle = style;
    }

    scenes.push({
      title: titleMatch?.[1]?.trim() || '',
      description: descMatch?.[1]?.trim() || '',
      narration: narrMatch?.[1]?.trim() || '',
      duration: durMatch ? Math.min(parseInt(durMatch[1]), 10) : 10,
      style,
    });
  }

  if (scenes.length === 0) {
    const lines = script.split('\n').filter((l) => l.trim());
    let currentScene: (typeof scenes)[0] | null = null;

    for (const line of lines) {
      const headingMatch = line.match(/^(?:#+\s*)?(?:场景|Scene|片段|Segment)\s*(\d+)/i);
      if (headingMatch) {
        if (currentScene) scenes.push(currentScene);
        currentScene = {
          title: '',
          description: '',
          narration: '',
          duration: 10,
          style: '',
        };
        continue;
      }

      if (!currentScene) continue;

      const kvMatch = line.match(/^(?:标题|Title)[：:]\s*(.+)/i);
      if (kvMatch) { currentScene.title = kvMatch[1].trim(); continue; }
      const descKV = line.match(/^(?:描述|Description)[：:]\s*(.+)/i);
      if (descKV) { currentScene.description = descKV[1].trim(); continue; }
      const narrKV = line.match(/^(?:旁白|Narration)[：:]\s*(.+)/i);
      if (narrKV) { currentScene.narration = narrKV[1].trim(); continue; }
      const durKV = line.match(/^(?:时长|Duration)[：:]\s*(\d+)/i);
      if (durKV) { currentScene.duration = Math.min(parseInt(durKV[1]), 10); continue; }
      const styleKV = line.match(/^(?:风格|Style)[：:]\s*(.+)/i);
      if (styleKV) {
        currentScene.style = styleKV[1].trim();
        if (!globalStyle) globalStyle = currentScene.style;
        continue;
      }
    }

    if (currentScene) scenes.push(currentScene);
  }

  const totalDuration = scenes.reduce((sum, s) => sum + s.duration, 0);
  if (totalDuration > 60) {
    const scale = 60 / totalDuration;
    let accumulated = 0;
    scenes.forEach((scene, i) => {
      if (i === scenes.length - 1) {
        scene.duration = Math.max(60 - Math.round(accumulated), 5);
      } else {
        const scaled = Math.round(scene.duration * scale);
        scene.duration = Math.max(scaled, 5);
        accumulated += scene.duration;
      }
    });
  }

  return { script, scenes, style: globalStyle };
}
