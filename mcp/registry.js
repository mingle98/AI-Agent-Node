import { CONFIG } from "../config.js";
import { registerExternalTools } from "../tools/index.js";
import { MCP_CONFIG } from "./index.js";
import { StreamableHttpMcpClient, SseMcpClient } from "./client.js";

const MCP_CLIENTS = new Map();
let initialized = false;

function stableHash(value) {
  const text = String(value || "");
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function sanitizeNamePart(value, fallback = "unnamed") {
  const cleaned = String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_\-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || fallback;
}

function toProjectToolName(prefix, serverKey, toolName, index = 0) {
  const rawToolName = String(toolName || `tool_${index}`);
  const readableToolPart = sanitizeNamePart(rawToolName, "tool");
  const hash = stableHash(`${serverKey}:${rawToolName}:${index}`).slice(0, 8);
  return `${sanitizeNamePart(prefix, "mcp")}__${sanitizeNamePart(serverKey, "server")}__${readableToolPart}__${hash}`;
}

function toParamType(schema = {}) {
  if (Array.isArray(schema.type)) {
    return schema.type.includes("number") || schema.type.includes("integer")
      ? "number"
      : schema.type.includes("boolean")
        ? "boolean"
        : "string";
  }
  if (schema.type === "number" || schema.type === "integer") return "number";
  if (schema.type === "boolean") return "boolean";
  if (schema.type === "object") return "object";
  if (schema.type === "array") return "array";
  return "string";
}

function exampleFromSchema(schema = {}) {
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (schema.enum?.length > 0) return schema.enum[0];
  if (schema.type === "number" || schema.type === "integer") return 1;
  if (schema.type === "boolean") return false;
  if (schema.type === "array") return "[]";
  if (schema.type === "object") return "{}";
  return "示例值";
}

function extractParams(inputSchema = {}) {
  const properties = inputSchema?.properties && typeof inputSchema.properties === "object"
    ? inputSchema.properties
    : {};
  const required = new Set(Array.isArray(inputSchema?.required) ? inputSchema.required : []);

  return Object.entries(properties).map(([name, schema]) => ({
    name,
    type: toParamType(schema),
    example: exampleFromSchema(schema),
    description: schema?.description || name,
    required: required.has(name),
    options: Array.isArray(schema?.enum) ? schema.enum : undefined,
    originalName: name,
  }));
}

function buildArguments(params, values) {
  const args = {};
  params.forEach((param, index) => {
    const value = values[index];
    if (value === undefined || value === null || value === "") {
      return;
    }
    args[param.originalName || param.name] = value;
  });
  return args;
}

function stringifyMcpResult(result) {
  if (result?.content && Array.isArray(result.content)) {
    return result.content.map((item) => {
      if (typeof item?.text === "string") return item.text;
      return JSON.stringify(item);
    }).join("\n");
  }
  if (typeof result === "string") return result;
  return JSON.stringify(result, null, 2);
}

function maskHeaderValue(key, value) {
  if (/authorization|token|key|secret/i.test(String(key))) {
    const text = String(value || "");
    return text.length > 12 ? `${text.slice(0, 10)}...` : "***";
  }
  return value;
}

function safeJsonPreview(value, maxLength = 500) {
  try {
    const text = typeof value === "string" ? value : JSON.stringify(value);
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
  } catch {
    return String(value).slice(0, maxLength);
  }
}

function summarizeMcpTool(mcpTool) {
  const schema = mcpTool?.inputSchema || mcpTool?.input_schema || {};
  const properties = schema?.properties && typeof schema.properties === "object" ? Object.keys(schema.properties) : [];
  return {
    name: mcpTool?.name || "",
    description: String(mcpTool?.description || "").slice(0, 80),
    params: properties,
  };
}

function createClient(serverKey, serverConfig) {
  if (serverConfig.type === "streamableHttp") {
    return new StreamableHttpMcpClient(serverKey, serverConfig, {
      initTimeoutMs: CONFIG.mcpInitTimeoutMs,
      callTimeoutMs: CONFIG.mcpCallTimeoutMs,
    });
  }
  if (serverConfig.type === "sse") {
    return new SseMcpClient(serverKey, serverConfig, {
      initTimeoutMs: CONFIG.mcpInitTimeoutMs,
      callTimeoutMs: CONFIG.mcpCallTimeoutMs,
    });
  }
  throw new Error(`暂不支持 MCP 类型: ${serverConfig.type}`);
}

function extractTextKeywords(text = "") {
  const normalized = String(text || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[，。；、：:,.!?！？()[\]{}<>《》"'`|/\\]+/g, " ");
  const tokens = normalized.match(/[\p{Script=Han}a-zA-Z0-9_\-]{2,}/gu) || [];
  return tokens
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && token.length <= 32);
}

function buildMcpKeywords({ serverKey, serverConfig, mcpTool, params }) {
  const keywordSet = new Set([
    "mcp",
    serverKey,
    serverConfig.name,
    mcpTool.name,
    ...(serverConfig.keywords || []),
    ...(mcpTool.keywords || []),
    ...extractTextKeywords(serverConfig.description),
    ...extractTextKeywords(mcpTool.description),
    ...params.flatMap((param) => [
      param.name,
      param.description,
      param.example,
      ...(param.options || []),
    ]),
  ].filter(Boolean).map((item) => String(item).trim()).filter((item) => item.length >= 2));

  return [...keywordSet].slice(0, 80);
}

function convertMcpToolToDefinition({ serverKey, serverConfig, mcpTool, client, index = 0 }) {
  const originalToolName = mcpTool.name;
  const toolName = toProjectToolName(CONFIG.mcpToolNamePrefix, serverKey, originalToolName, index);
  const params = extractParams(mcpTool.inputSchema || mcpTool.input_schema || {});
  const keywords = buildMcpKeywords({ serverKey, serverConfig, mcpTool, params });
  const exampleArgs = params.map((param) => JSON.stringify(param.example)).join(", ");

  return {
    name: toolName,
    func: async (...values) => {
      const args = buildArguments(params, values);
      console.log(`🔧 [MCP:call] ${toolName} -> ${serverKey}/${originalToolName} args=${safeJsonPreview(args, 600)}`);
      const startedAt = Date.now();
      try {
        const result = await client.callTool(originalToolName, args);
        const textResult = stringifyMcpResult(result);
        console.log(`✅ [MCP:call] ${toolName} 完成 (${Date.now() - startedAt}ms) result=${safeJsonPreview(textResult, 600)}`);
        return textResult;
      } catch (error) {
        console.warn(`⚠️ [MCP:call] ${toolName} 失败 (${Date.now() - startedAt}ms): ${error.message}`);
        throw error;
      }
    },
    description: `[MCP:${serverConfig.name || serverKey}] ${serverConfig.description || ""}\n${mcpTool.description || originalToolName}`.trim(),
    keywords,
    params,
    example: `${toolName}(${exampleArgs})`,
    source: "mcp",
    mcp: {
      serverKey,
      serverName: serverConfig.name || serverKey,
      originalToolName,
    },
  };
}

export async function initMcpTools(options = {}) {
  if (!CONFIG.mcpEnabled && options.force !== true) {
    console.log("🔌 [MCP] 未开启，跳过 MCP 工具初始化");
    return { enabled: false, registered: [], servers: [] };
  }
  if (initialized && options.force !== true) {
    console.log(`🔌 [MCP] 已初始化，跳过重复初始化，servers=${[...MCP_CLIENTS.keys()].join(", ") || "无"}`);
    return { enabled: true, registered: [], servers: [...MCP_CLIENTS.keys()], alreadyInitialized: true };
  }

  const servers = MCP_CONFIG?.mcpServers || {};
  const definitions = [];
  const serverResults = [];
  const activeServers = Object.entries(servers).filter(([, serverConfig]) => serverConfig?.isActive);
  console.log(`🔌 [MCP] 开始初始化，activeServers=${activeServers.length}, prefix=${CONFIG.mcpToolNamePrefix}`);

  for (const [serverKey, serverConfig] of Object.entries(servers)) {
    if (!serverConfig?.isActive) {
      console.log(`⏭️ [MCP] ${serverKey} 未启用，跳过`);
      continue;
    }

    try {
      const maskedHeaders = Object.fromEntries(
        Object.entries(serverConfig.headers || {}).map(([key, value]) => [key, maskHeaderValue(key, value)])
      );
      console.log(`🔌 [MCP] 连接 server=${serverKey}, type=${serverConfig.type}, name=${serverConfig.name || serverKey}, baseUrl=${serverConfig.baseUrl}, headers=${safeJsonPreview(maskedHeaders, 300)}`);
      const client = createClient(serverKey, serverConfig);
      const initStartedAt = Date.now();
      await client.initialize();
      console.log(`✅ [MCP] ${serverKey} initialize 完成 (${Date.now() - initStartedAt}ms)`);
      const tools = await client.listTools();
      MCP_CLIENTS.set(serverKey, client);
      console.log(`🔌 [MCP] ${serverKey} tools/list 返回 ${tools.length} 个工具: ${safeJsonPreview(tools.map(summarizeMcpTool), 1200)}`);

      for (const [index, mcpTool] of tools.entries()) {
        if (!mcpTool?.name) {
          console.warn(`⚠️ [MCP] ${serverKey} 第 ${index + 1} 个工具缺少 name，已跳过: ${safeJsonPreview(mcpTool, 300)}`);
          continue;
        }
        const definition = convertMcpToolToDefinition({ serverKey, serverConfig, mcpTool, client, index });
        definitions.push(definition);
        console.log(`🧩 [MCP:map] ${serverKey}/${mcpTool.name} -> ${definition.name}, params=${definition.params.map((p) => p.name).join(",") || "无"}, keywords=${definition.keywords.slice(0, 12).join(",")}`);
      }

      serverResults.push({ serverKey, ok: true, toolCount: tools.length });
      console.log(`🔌 [MCP] ${serverKey} 已加载 ${tools.length} 个工具`);
    } catch (error) {
      serverResults.push({ serverKey, ok: false, error: error.message });
      console.warn(`⚠️ [MCP] ${serverKey} 初始化失败: ${error.message}`);
    }
  }

  const registered = [];
  try {
    console.log(`🧩 [MCP:register] 准备注册 ${definitions.length} 个 MCP 工具`);
    registered.push(...registerExternalTools(definitions));
  } catch (error) {
    initialized = true;
    console.warn(`⚠️ [MCP] 工具注册失败，已跳过 MCP 工具注册: ${error.message}`);
    return {
      enabled: true,
      registered,
      servers: serverResults,
      error: error.message,
    };
  }
  initialized = true;
  console.log(`🔌 [MCP] 注册完成: ${registered.length} 个工具`);
  if (registered.length > 0) {
    console.log(`🧩 [MCP:registered] ${registered.join(", ")}`);
  }

  return {
    enabled: true,
    registered,
    servers: serverResults,
  };
}

export function convertMcpToolToDefinitionForTest(args) {
  return convertMcpToolToDefinition(args);
}

export function createClientForTest(serverKey, serverConfig) {
  return createClient(serverKey, serverConfig);
}

export function getMcpClients() {
  return MCP_CLIENTS;
}

export function resetMcpRegistryForTest() {
  MCP_CLIENTS.clear();
  initialized = false;
}
