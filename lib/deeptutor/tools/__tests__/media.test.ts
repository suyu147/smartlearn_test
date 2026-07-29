import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ImageGenTool,
  VideoGenTool,
  VoiceTool,
  createMediaTools,
  setMediaToolContext,
  getMediaConfig,
} from '../media';

describe('createMediaTools', () => {
  it('creates 3 media tools', () => {
    const tools = createMediaTools();
    expect(tools).toHaveLength(3);
    expect(tools[0]).toBeInstanceOf(ImageGenTool);
    expect(tools[1]).toBeInstanceOf(VideoGenTool);
    expect(tools[2]).toBeInstanceOf(VoiceTool);
  });
});

describe('MediaServiceConfig', () => {
  it('defaults to none providers', () => {
    setMediaToolContext({});
    const config = getMediaConfig();
    expect(config.imageProvider).toBe('none');
    expect(config.videoProvider).toBe('none');
    expect(config.voiceProvider).toBe('none');
  });

  it('merges partial config', () => {
    setMediaToolContext({ imageProvider: 'openai', apiKeys: { openai: 'test-key' } });
    const config = getMediaConfig();
    expect(config.imageProvider).toBe('openai');
    expect(config.apiKeys.openai).toBe('test-key');
  });
});

describe('ImageGenTool', () => {
  const tool = new ImageGenTool();

  describe('getDefinition', () => {
    it('has correct name and parameters', () => {
      const def = tool.getDefinition();
      expect(def.name).toBe('imagegen');
      expect(def.parameters).toHaveLength(4);
      expect(def.parameters[0].name).toBe('prompt');
      expect(def.parameters[0].required).toBe(true);
      expect(def.parameters[1].name).toBe('style');
      expect(def.parameters[2].name).toBe('size');
      expect(def.parameters[3].name).toBe('quality');
    });
  });

  describe('getPromptHints', () => {
    it('returns hints with shortDescription', () => {
      const hints = tool.getPromptHints();
      expect(hints.shortDescription).toContain('image');
    });
  });

  describe('execute', () => {
    it('returns error when provider is none', async () => {
      setMediaToolContext({ imageProvider: 'none' });
      const result = await tool.execute({ prompt: 'A sunset' });
      expect(result.success).toBe(false);
      expect(result.content).toContain('not configured');
    });
  });
});

describe('VideoGenTool', () => {
  const tool = new VideoGenTool();

  describe('getDefinition', () => {
    it('has correct name and parameters', () => {
      const def = tool.getDefinition();
      expect(def.name).toBe('videogen');
      expect(def.parameters).toHaveLength(3);
      expect(def.parameters[0].name).toBe('prompt');
      expect(def.parameters[1].name).toBe('duration');
      expect(def.parameters[2].name).toBe('style');
    });
  });

  describe('getPromptHints', () => {
    it('includes note about compute intensity', () => {
      const hints = tool.getPromptHints();
      expect(hints.note).toContain('compute-intensive');
    });
  });

  describe('execute', () => {
    it('returns error when provider is none', async () => {
      setMediaToolContext({ videoProvider: 'none' });
      const result = await tool.execute({ prompt: 'A flying bird' });
      expect(result.success).toBe(false);
      expect(result.content).toContain('not configured');
    });

    it('returns error for pika provider (not implemented)', async () => {
      setMediaToolContext({ videoProvider: 'pika' as 'runwayml' });
      const result = await tool.execute({ prompt: 'A flying bird' });
      expect(result.success).toBe(false);
      expect(result.content).toContain('not yet implemented');
    });

    describe('RunwayML integration', () => {
      beforeEach(() => {
        vi.restoreAllMocks();
      });

      it('returns error when RunwayML API secret is missing', async () => {
        const original = process.env.RUNWAYML_API_SECRET;
        delete process.env.RUNWAYML_API_SECRET;
        try {
          setMediaToolContext({ videoProvider: 'runwayml', apiKeys: {} });
          const result = await tool.execute({ prompt: 'A flying bird', duration: 4, style: 'cinematic' });
          expect(result.success).toBe(false);
          expect(result.content).toContain('API secret not configured');
        } finally {
          if (original !== undefined) process.env.RUNWAYML_API_SECRET = original;
        }
      });

      it('submits task and polls until SUCCEEDED', async () => {
        let callCount = 0;
        vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
          callCount++;
          if (url.includes('/generations/video')) {
            // Submit response
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve({ id: 'task_123' }),
            });
          }
          // Poll response
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              status: 'SUCCEEDED',
              output: { video_url: 'https://runway.com/video/abc.mp4' },
            }),
          });
        }));

        setMediaToolContext({
          videoProvider: 'runwayml',
          apiKeys: { runwayml: 'test-secret' },
        });

        const result = await tool.execute({
          prompt: 'A sunset over the ocean',
          duration: 4,
          style: 'cinematic',
        });

        expect(result.success).toBe(true);
        expect(result.content).toContain('https://runway.com/video/abc.mp4');
        expect(result.metadata.provider).toBe('runwayml');
        expect(result.metadata.status).toBe('completed');
        expect(result.metadata.taskId).toBe('task_123');
        expect(callCount).toBeGreaterThanOrEqual(2); // submit + at least 1 poll

        vi.unstubAllGlobals();
      }, 15000);

      it('throws on RunwayML submission failure', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
          ok: false,
          status: 401,
          text: () => Promise.resolve('Unauthorized'),
        }));

        setMediaToolContext({
          videoProvider: 'runwayml',
          apiKeys: { runwayml: 'bad-secret' },
        });

        const result = await tool.execute({ prompt: 'test' });
        expect(result.success).toBe(false);
        expect(result.content).toContain('RunwayML submit error');

        vi.unstubAllGlobals();
      });

      it('handles FAILED task status', async () => {
        let callCount = 0;
        vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
          callCount++;
          if (url.includes('/generations/video')) {
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve({ id: 'task_fail' }),
            });
          }
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              status: 'FAILED',
              failure: 'Content policy violation',
            }),
          });
        }));

        setMediaToolContext({
          videoProvider: 'runwayml',
          apiKeys: { runwayml: 'test-secret' },
        });

        const result = await tool.execute({ prompt: 'test' });
        expect(result.success).toBe(false);
        expect(result.content).toContain('Content policy violation');

        vi.unstubAllGlobals();
      }, 15000);
    });
  });
});

describe('VoiceTool', () => {
  const tool = new VoiceTool();

  describe('getDefinition', () => {
    it('has correct name and parameters', () => {
      const def = tool.getDefinition();
      expect(def.name).toBe('voice');
      expect(def.parameters).toHaveLength(4);
      expect(def.parameters[0].name).toBe('text');
      expect(def.parameters[1].name).toBe('voice');
      expect(def.parameters[2].name).toBe('speed');
      expect(def.parameters[3].name).toBe('language');
    });
  });

  describe('execute', () => {
    it('returns error when provider is none', async () => {
      setMediaToolContext({ voiceProvider: 'none' });
      const result = await tool.execute({ text: 'Hello world' });
      expect(result.success).toBe(false);
      expect(result.content).toContain('not configured');
    });

    it('returns pending for edge provider', async () => {
      // Mock fetch to return a fake audio response (Edge TTS makes a real HTTP call)
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(1024)),
      }));

      setMediaToolContext({ voiceProvider: 'edge' });
      const result = await tool.execute({ text: 'Hello', language: 'en' });
      expect(result.success).toBe(true);
      expect(result.metadata.provider).toBe('edge');

      vi.unstubAllGlobals();
    });
  });
});
