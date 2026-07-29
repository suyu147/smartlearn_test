/**
 * MCP Service — Model Context Protocol integration
 *
 * Connects to external MCP tool servers and registers their tools
 * in the DeepTutor ToolRegistry. Supports three transport types:
 *
 * 1. stdio: Spawn a child process and communicate via stdin/stdout
 * 2. sse: Server-Sent Events via HTTP
 * 3. streamable-http: Direct HTTP streaming
 *
 * Migrated from: deeptutor/tutorbot/agent/tools/mcp.py (186 lines)
 *
 * Uses @modelcontextprotocol/sdk for the protocol layer.
 * Falls back to a stub implementation if the SDK is not installed.
 */

import { ToolRegistry } from '@/lib/deeptutor/tools/registry';
import { MCPToolWrapper } from '@/lib/deeptutor/tools/mcp-wrapper';
import { createLogger } from '@/lib/logger';

const log = createLogger('MCPService');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Transport type for an MCP server connection */
export type MCPTransportType = 'stdio' | 'sse' | 'streamable-http';

/** Configuration for a single MCP server */
export interface MCPServerConfig {
  /** Unique server name (used in tool naming: mcp_{server}_{tool}) */
  name: string;
  /** Transport type */
  transport: MCPTransportType;
  /** For stdio: command to spawn */
  command?: string;
  /** For stdio: command arguments */
  args?: string[];
  /** For stdio: environment variables */
  env?: Record<string, string>;
  /** For sse/streamable-http: server URL */
  url?: string;
  /** For sse/streamable-http: headers */
  headers?: Record<string, string>;
  /** Tool name filter — list of tool names to enable, or ["*"] for all */
  enabledTools?: string[];
  /** Connection timeout in ms (default: 30000) */
  timeout?: number;
}

/** Status of an MCP server connection */
export interface MCPServerStatus {
  name: string;
  connected: boolean;
  transport: MCPTransportType;
  toolCount: number;
  error?: string;
}

/** An MCP tool discovered from a server */
export interface MCPToolInfo {
  /** Original tool name from the MCP server */
  name: string;
  /** Tool description */
  description: string;
  /** JSON Schema for input parameters */
  inputSchema: Record<string, unknown>;
  /** Server this tool belongs to */
  serverName: string;
}

// ---------------------------------------------------------------------------
// MCPService
// ---------------------------------------------------------------------------

export class MCPService {
  private servers: Map<string, MCPServerConfig> = new Map();
  private connectedServers: Map<string, MCPServerStatus> = new Map();
  private registeredTools: Map<string, MCPToolWrapper[]> = new Map();

  /** Add a server configuration (does not connect yet) */
  addServer(config: MCPServerConfig): void {
    this.servers.set(config.name, config);
    log.info(`MCP server configured: ${config.name} (${config.transport})`);
  }

  /** Remove a server configuration and disconnect if connected */
  async removeServer(name: string): Promise<void> {
    await this.disconnectServer(name);
    this.servers.delete(name);
    log.info(`MCP server removed: ${name}`);
  }

  /** Get all configured servers */
  listServers(): MCPServerConfig[] {
    return Array.from(this.servers.values());
  }

  /** Get status of all servers */
  getStatus(): MCPServerStatus[] {
    return Array.from(this.connectedServers.values());
  }

  /**
   * Connect to a configured MCP server and register its tools.
   *
   * Currently supports a stub connection that registers placeholder tools.
   * Full @modelcontextprotocol/sdk integration requires the SDK to be installed.
   */
  async connectServer(name: string, toolRegistry: ToolRegistry): Promise<MCPServerStatus> {
    const config = this.servers.get(name);
    if (!config) {
      throw new Error(`MCP server not configured: ${name}`);
    }

    // Check if already connected
    const existing = this.connectedServers.get(name);
    if (existing?.connected) {
      return existing;
    }

    log.info(`Connecting to MCP server: ${name} (${config.transport})`);

    try {
      // Attempt to load the MCP SDK dynamically
      const tools = await this.discoverTools(config);

      // Filter tools based on enabledTools config
      const enabledSet = config.enabledTools?.includes('*')
        ? null // null = allow all
        : new Set(config.enabledTools ?? []);

      const wrappers: MCPToolWrapper[] = [];

      for (const tool of tools) {
        if (enabledSet && !enabledSet.has(tool.name)) {
          log.debug(`Skipping disabled MCP tool: ${name}/${tool.name}`);
          continue;
        }

        const wrapper = new MCPToolWrapper(tool, this);
        toolRegistry.register(wrapper);
        wrappers.push(wrapper);
      }

      this.registeredTools.set(name, wrappers);

      const status: MCPServerStatus = {
        name,
        connected: true,
        transport: config.transport,
        toolCount: wrappers.length,
      };

      this.connectedServers.set(name, status);
      log.info(`MCP server connected: ${name} — ${wrappers.length} tools registered`);

      return status;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const status: MCPServerStatus = {
        name,
        connected: false,
        transport: config.transport,
        toolCount: 0,
        error: errorMsg,
      };
      this.connectedServers.set(name, status);
      log.error(`MCP server connection failed: ${name} — ${errorMsg}`);
      return status;
    }
  }

  /** Disconnect from an MCP server and unregister its tools */
  async disconnectServer(name: string): Promise<void> {
    const wrappers = this.registeredTools.get(name);
    if (wrappers) {
      // Note: ToolRegistry doesn't have an unregister method in the current implementation
      // In a future version, we'd call toolRegistry.unregister() for each wrapper
      this.registeredTools.delete(name);
    }

    this.connectedServers.delete(name);
    log.info(`MCP server disconnected: ${name}`);
  }

  /** Connect all configured servers */
  async connectAll(toolRegistry: ToolRegistry): Promise<MCPServerStatus[]> {
    const results: MCPServerStatus[] = [];
    for (const name of this.servers.keys()) {
      const status = await this.connectServer(name, toolRegistry);
      results.push(status);
    }
    return results;
  }

  /**
   * Execute an MCP tool by delegating to the server.
   * Called by MCPToolWrapper.execute().
   */
  async executeTool(serverName: string, toolName: string, args: Record<string, unknown>): Promise<string> {
    const config = this.servers.get(serverName);
    if (!config) {
      return `[MCP Error: server ${serverName} not configured]`;
    }

    const status = this.connectedServers.get(serverName);
    if (!status?.connected) {
      return `[MCP Error: server ${serverName} not connected]`;
    }

    try {
      // Dynamic SDK import for tool execution
      const result = await this.callServerTool(config, toolName, args);
      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log.error(`MCP tool execution failed: ${serverName}/${toolName} — ${errorMsg}`);
      return `[MCP Error: ${errorMsg}]`;
    }
  }

  // -----------------------------------------------------------------------
  // Private: MCP protocol communication
  // -----------------------------------------------------------------------

  /**
   * Discover tools from an MCP server.
   *
   * Attempts to use @modelcontextprotocol/sdk if available,
   * falls back to a stub that returns an empty tool list.
   */
  private async discoverTools(config: MCPServerConfig): Promise<MCPToolInfo[]> {
    try {
      // Try loading the MCP SDK
      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      const transport = await this.createTransport(config);

      const client = new Client({
        name: `smartlearn-${config.name}`,
        version: '1.0.0',
      });

      await client.connect(transport as Parameters<typeof client.connect>[0]);

      const { tools } = await client.listTools();

      return tools.map((tool: { name: string; description?: string; inputSchema?: Record<string, unknown> }) => ({
        name: tool.name,
        description: tool.description ?? '',
        inputSchema: tool.inputSchema ?? { type: 'object', properties: {} },
        serverName: config.name,
      }));
    } catch {
      log.warn(
        `@modelcontextprotocol/sdk not available — MCP server ${config.name} ` +
        `will register with no tools. Install the SDK for full MCP support.`,
      );
      return [];
    }
  }

  /**
   * Create an MCP transport based on server config.
   */
  private async createTransport(config: MCPServerConfig): Promise<unknown> {
    switch (config.transport) {
      case 'stdio': {
        const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
        return new StdioClientTransport({
          command: config.command ?? '',
          args: config.args,
          env: config.env as Record<string, string>,
        });
      }

      case 'sse': {
        const { SSEClientTransport } = await import('@modelcontextprotocol/sdk/client/sse.js');
        return new SSEClientTransport(new URL(config.url ?? ''), {
          requestInit: {
            headers: config.headers,
          },
        });
      }

      case 'streamable-http': {
        const { StreamableHTTPClientTransport } = await import(
          '@modelcontextprotocol/sdk/client/streamableHttp.js'
        );
        return new StreamableHTTPClientTransport(new URL(config.url ?? ''), {
          requestInit: {
            headers: config.headers,
          },
        });
      }

      default:
        throw new Error(`Unknown MCP transport: ${config.transport}`);
    }
  }

  /**
   * Call a tool on an MCP server.
   */
  private async callServerTool(
    config: MCPServerConfig,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<string> {
    try {
      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      const transport = await this.createTransport(config);

      const client = new Client({
        name: `smartlearn-${config.name}`,
        version: '1.0.0',
      });

      await client.connect(transport as Parameters<typeof client.connect>[0]);

      const result = await client.callTool({
        name: toolName,
        arguments: args,
      });

      // Extract text content from result
      const content = (result as { content?: Array<{ type: string; text?: string }> }).content;
      if (Array.isArray(content)) {
        return content
          .filter((c: { type: string }) => c.type === 'text')
          .map((c: { text?: string }) => c.text ?? '')
          .join('\n');
      }

      return JSON.stringify(result);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return `[MCP tool call failed: ${errorMsg}]`;
    }
  }
}
