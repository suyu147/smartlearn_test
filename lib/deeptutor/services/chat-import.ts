/**
 * ChatImportService — Import chat histories from external sources.
 *
 * Supports importing conversations from:
 * - OpenAI ChatGPT exports (JSON format)
 * - Claude exports (JSON format)
 * - Generic JSON/JSONL format
 * - Plain text conversation logs
 *
 * Imported messages are converted to the internal Session/Turn/Message format.
 *
 * Phase 5 feature: enables users to bring their conversation history
 * from other AI assistants into SmartLearn.
 */

import { createLogger } from '@/lib/logger';
import { promises as fs } from 'fs';
import path from 'path';

const log = createLogger('ChatImportService');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ImportedMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

export interface ImportedConversation {
  id: string;
  title: string;
  messages: ImportedMessage[];
  createdAt: string;
  updatedAt: string;
  source: string;
  metadata?: Record<string, unknown>;
}

export interface ImportResult {
  success: boolean;
  conversationsImported: number;
  messagesImported: number;
  errors: string[];
  conversationIds: string[];
}

export type ImportFormat = 'chatgpt' | 'claude' | 'generic_json' | 'jsonl' | 'text';

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ChatImportService {
  /**
   * Import a file and return parsed conversations.
   */
  async importFile(
    filePath: string,
    format?: ImportFormat,
  ): Promise<ImportedConversation[]> {
    const detectedFormat = format ?? this.detectFormat(filePath);

    log.info(`Importing ${filePath} as format=${detectedFormat}`);

    const content = await fs.readFile(filePath, 'utf-8');

    switch (detectedFormat) {
      case 'chatgpt':
        return this.parseChatGPT(content);
      case 'claude':
        return this.parseClaude(content);
      case 'generic_json':
        return this.parseGenericJSON(content);
      case 'jsonl':
        return this.parseJSONL(content);
      case 'text':
        return this.parseText(content);
      default:
        throw new Error(`Unsupported import format: ${detectedFormat}`);
    }
  }

  /**
   * Import from raw string content with explicit format.
   */
  async importContent(
    content: string,
    format: ImportFormat,
    filename: string = 'import',
  ): Promise<ImportedConversation[]> {
    log.info(`Importing content as format=${format}`);

    switch (format) {
      case 'chatgpt':
        return this.parseChatGPT(content);
      case 'claude':
        return this.parseClaude(content);
      case 'generic_json':
        return this.parseGenericJSON(content);
      case 'jsonl':
        return this.parseJSONL(content);
      case 'text':
        return this.parseText(content);
      default:
        throw new Error(`Unsupported import format: ${format}`);
    }
  }

  // -------------------------------------------------------------------------
  // Format Detection
  // -------------------------------------------------------------------------

  private detectFormat(filePath: string): ImportFormat {
    const ext = path.extname(filePath).toLowerCase();
    const basename = path.basename(filePath).toLowerCase();

    if (ext === '.jsonl') return 'jsonl';
    if (ext === '.txt' || ext === '.log') return 'text';
    if (ext !== '.json') return 'text';

    // For JSON files, check the filename hints
    if (basename.includes('chatgpt') || basename.includes('conversations')) return 'chatgpt';
    if (basename.includes('claude')) return 'claude';

    // Default to generic JSON
    return 'generic_json';
  }

  // -------------------------------------------------------------------------
  // ChatGPT Export Parser
  // -------------------------------------------------------------------------

  /**
   * Parse ChatGPT data export format.
   * ChatGPT exports conversations as a JSON array of conversation objects.
   * Each conversation has a "mapping" of message nodes.
   */
  private parseChatGPT(content: string): ImportedConversation[] {
    const data = JSON.parse(content);
    const conversations: ImportedConversation[] = [];

    const items = Array.isArray(data) ? data : [data];

    for (const item of items) {
      try {
        const id = item.id ?? `chatgpt-${conversations.length}`;
        const title = item.title ?? 'Imported ChatGPT Conversation';
        const createTime = item.create_time
          ? new Date(item.create_time * 1000).toISOString()
          : new Date().toISOString();
        const updateTime = item.update_time
          ? new Date(item.update_time * 1000).toISOString()
          : createTime;

        const messages: ImportedMessage[] = [];

        // ChatGPT uses a "mapping" of nodes with parent-child relationships
        if (item.mapping && typeof item.mapping === 'object') {
          // Build ordered message list from the node chain
          const nodes = new Map<string, Record<string, unknown>>();
          for (const [nodeId, node] of Object.entries(item.mapping as Record<string, unknown>)) {
            nodes.set(nodeId, node as Record<string, unknown>);
          }

          // Find root and traverse
          const ordered = this.traverseChatGPTNodes(nodes);
          for (const node of ordered) {
            const message = node.message as Record<string, unknown> | undefined;
            if (!message) continue;

            const role = this.mapChatGPTRole(message.author as string | undefined);
            const msgContent = message.content as Record<string, unknown> | undefined;
            const contentParts = msgContent?.parts as string[] | undefined;
            const text = contentParts?.join('\n') ?? '';

            if (role && text.trim()) {
              messages.push({
                role,
                content: text,
                timestamp: message.create_time
                  ? new Date((message.create_time as number) * 1000).toISOString()
                  : undefined,
                metadata: { model: message.model_slug as string | undefined },
              });
            }
          }
        }

        if (messages.length > 0) {
          conversations.push({
            id,
            title,
            messages,
            createdAt: createTime,
            updatedAt: updateTime,
            source: 'chatgpt',
          });
        }
      } catch (err) {
        log.error('Failed to parse ChatGPT conversation:', err);
      }
    }

    return conversations;
  }

  private traverseChatGPTNodes(nodes: Map<string, Record<string, unknown>>): Record<string, unknown>[] {
    // Find nodes with no parent (roots)
    const childToParent = new Map<string, string>();
    const children = new Map<string, string[]>();

    for (const [id, node] of nodes) {
      const parentId = node.parent as string | null;
      if (parentId) {
        childToParent.set(id, parentId);
      }
      const childIds = (node.children as string[]) ?? [];
      children.set(id, childIds);
    }

    // Find root (no parent or parent is null)
    let rootId: string | null = null;
    for (const [id, node] of nodes) {
      if (!node.parent || node.parent === null) {
        rootId = id;
        break;
      }
    }

    if (!rootId) return [];

    // BFS traversal
    const result: Record<string, unknown>[] = [];
    const queue: string[] = [rootId];

    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      const node = nodes.get(nodeId);
      if (node) {
        result.push(node);
        const childIds = children.get(nodeId) ?? [];
        queue.push(...childIds);
      }
    }

    return result;
  }

  private mapChatGPTRole(author: string | undefined): 'user' | 'assistant' | 'system' | null {
    switch (author) {
      case 'user': return 'user';
      case 'assistant': return 'assistant';
      case 'system': return 'system';
      default: return null;
    }
  }

  // -------------------------------------------------------------------------
  // Claude Export Parser
  // -------------------------------------------------------------------------

  /**
   * Parse Claude conversation export format.
   * Claude exports as JSON with a "chat_messages" array.
   */
  private parseClaude(content: string): ImportedConversation[] {
    const data = JSON.parse(content);

    // Claude can export as single conversation or array
    const chatArrays = Array.isArray(data)
      ? [data]
      : data.chat_messages
        ? [data.chat_messages]
        : data.conversations
          ? data.conversations.map((c: Record<string, unknown>) => c.messages ?? [])
          : [[data]];

    const conversations: ImportedConversation[] = [];

    for (let i = 0; i < chatArrays.length; i++) {
      const chatMessages = chatArrays[i] as Array<Record<string, unknown>>;
      const messages: ImportedMessage[] = [];

      for (const msg of chatMessages) {
        const role = msg.sender === 'human' ? 'user'
          : msg.sender === 'assistant' ? 'assistant'
            : msg.role === 'user' ? 'user'
              : msg.role === 'assistant' ? 'assistant'
                : null;

        const text = (msg.text ?? msg.content ?? '') as string;

        if (role && text.trim()) {
          messages.push({
            role,
            content: text,
            timestamp: msg.timestamp as string | undefined,
          });
        }
      }

      if (messages.length > 0) {
        conversations.push({
          id: `claude-${i}`,
          title: (data.name ?? data.title ?? `Imported Claude Conversation ${i + 1}`) as string,
          messages,
          createdAt: (data.created_at ?? new Date().toISOString()) as string,
          updatedAt: (data.updated_at ?? new Date().toISOString()) as string,
          source: 'claude',
        });
      }
    }

    return conversations;
  }

  // -------------------------------------------------------------------------
  // Generic JSON Parser
  // -------------------------------------------------------------------------

  /**
   * Parse generic JSON format with role/content message arrays.
   * Supports: [{ role, content }], { messages: [...] }, etc.
   */
  private parseGenericJSON(content: string): ImportedConversation[] {
    const data = JSON.parse(content);

    // Try to find message array
    let messageArray: Array<Record<string, unknown>>;

    if (Array.isArray(data)) {
      // Could be array of messages or array of conversations
      if (data.length > 0 && Array.isArray(data[0])) {
        // Array of conversations
        return data.map((conv: Array<Record<string, unknown>>, i: number) => ({
          id: `generic-${i}`,
          title: `Imported Conversation ${i + 1}`,
          messages: this.extractMessages(conv),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          source: 'generic_json',
        })).filter((c: ImportedConversation) => c.messages.length > 0);
      }
      messageArray = data;
    } else if (data.messages && Array.isArray(data.messages)) {
      messageArray = data.messages;
    } else if (data.conversation && Array.isArray(data.conversation)) {
      messageArray = data.conversation;
    } else {
      // Wrap single object
      messageArray = [data];
    }

    const messages = this.extractMessages(messageArray);
    if (messages.length === 0) return [];

    return [
      {
        id: 'generic-0',
        title: (data.title ?? 'Imported Conversation') as string,
        messages,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        source: 'generic_json',
      },
    ];
  }

  private extractMessages(arr: Array<Record<string, unknown>>): ImportedMessage[] {
    const messages: ImportedMessage[] = [];

    for (const item of arr) {
      const role = item.role as string | undefined;
      const content = (item.content ?? item.text ?? item.message ?? '') as string;

      const mappedRole = role === 'user' ? 'user'
        : role === 'assistant' || role === 'bot' ? 'assistant'
          : role === 'system' ? 'system'
            : null;

      if (mappedRole && content.trim()) {
        messages.push({
          role: mappedRole,
          content,
          timestamp: item.timestamp as string | undefined,
        });
      }
    }

    return messages;
  }

  // -------------------------------------------------------------------------
  // JSONL Parser
  // -------------------------------------------------------------------------

  /**
   * Parse JSONL format (one JSON object per line).
   * Each line is a message with role and content.
   */
  private parseJSONL(content: string): ImportedConversation[] {
    const lines = content.split('\n').filter((l) => l.trim());
    const messages: ImportedMessage[] = [];

    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        const role = obj.role ?? obj.sender;
        const text = obj.content ?? obj.text ?? obj.message ?? '';

        const mappedRole = role === 'user' || role === 'human' ? 'user'
          : role === 'assistant' || role === 'bot' ? 'assistant'
            : role === 'system' ? 'system'
              : null;

        if (mappedRole && String(text).trim()) {
          messages.push({
            role: mappedRole as 'user' | 'assistant' | 'system',
            content: String(text),
            timestamp: obj.timestamp,
          });
        }
      } catch {
        // Skip invalid lines
      }
    }

    if (messages.length === 0) return [];

    return [
      {
        id: 'jsonl-0',
        title: 'Imported JSONL Conversation',
        messages,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        source: 'jsonl',
      },
    ];
  }

  // -------------------------------------------------------------------------
  // Plain Text Parser
  // -------------------------------------------------------------------------

  /**
   * Parse plain text conversation logs.
   * Detects common patterns like:
   * - "User: ..." / "Assistant: ..."
   * - "Human: ..." / "AI: ..."
   * - "Q: ..." / "A: ..."
   * - ">>> ..." / "<<< ..."
   */
  private parseText(content: string): ImportedConversation[] {
    const lines = content.split('\n');
    const messages: ImportedMessage[] = [];

    const patterns = [
      /^(?:User|Human|You|Q)\s*[:：]\s*(.+)/i,
      /^(?:Assistant|AI|Bot|A)\s*[:：]\s*(.+)/i,
      /^>>>\s*(.+)/,
      /^<<<\s*(.+)/,
    ];

    let currentRole: 'user' | 'assistant' | null = null;
    let currentContent: string[] = [];

    for (const line of lines) {
      const userMatch = line.match(patterns[0]!);
      const assistantMatch = line.match(patterns[1]!);

      if (userMatch) {
        if (currentRole && currentContent.length > 0) {
          messages.push({ role: currentRole, content: currentContent.join('\n').trim() });
        }
        currentRole = 'user';
        currentContent = [userMatch[1]!];
      } else if (assistantMatch) {
        if (currentRole && currentContent.length > 0) {
          messages.push({ role: currentRole, content: currentContent.join('\n').trim() });
        }
        currentRole = 'assistant';
        currentContent = [assistantMatch[1]!];
      } else if (line.match(/^>>>/)) {
        if (currentRole && currentContent.length > 0) {
          messages.push({ role: currentRole, content: currentContent.join('\n').trim() });
        }
        currentRole = 'user';
        currentContent = [line.replace(/^>>>\s*/, '')];
      } else if (line.match(/^<</)) {
        if (currentRole && currentContent.length > 0) {
          messages.push({ role: currentRole, content: currentContent.join('\n').trim() });
        }
        currentRole = 'assistant';
        currentContent = [line.replace(/^<<<\s*/, '')];
      } else if (currentRole) {
        // Continuation of current message
        currentContent.push(line);
      }
    }

    // Flush last message
    if (currentRole && currentContent.length > 0) {
      messages.push({ role: currentRole, content: currentContent.join('\n').trim() });
    }

    if (messages.length === 0) return [];

    return [
      {
        id: 'text-0',
        title: 'Imported Text Conversation',
        messages,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        source: 'text',
      },
    ];
  }
}
