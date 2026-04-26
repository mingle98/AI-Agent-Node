function withTimeout(promiseFactory, timeoutMs, label = "operation") {
  if (!timeoutMs || timeoutMs <= 0) {
    return typeof promiseFactory === "function" ? promiseFactory() : promiseFactory;
  }

  const controller = typeof AbortController === "function" ? new AbortController() : null;
  let timer = null;
  const operation = typeof promiseFactory === "function"
    ? promiseFactory(controller?.signal)
    : promiseFactory;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller?.abort?.();
      reject(new Error(`${label} 超时: ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([operation, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function normalizeHeaderValue(value) {
  return value == null ? "" : String(value);
}

function resolveEnvPlaceholders(value) {
  if (typeof value !== "string") {
    return value;
  }
  return value.replace(/\$\{([A-Z0-9_]+)\}/gi, (_, name) => process.env[name] || "");
}

function resolveHeaders(headers = {}) {
  const result = {};
  for (const [key, value] of Object.entries(headers || {})) {
    const resolved = resolveEnvPlaceholders(normalizeHeaderValue(value));
    if (!resolved || /Bearer\s*$/i.test(resolved.trim())) {
      continue;
    }
    result[key] = resolved;
  }
  return result;
}

function safeJsonPreview(value, maxLength = 500) {
  try {
    const text = typeof value === "string" ? value : JSON.stringify(value);
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
  } catch {
    return String(value).slice(0, maxLength);
  }
}

function normalizeJsonRpcPayload(payload) {
  if (payload && typeof payload === "object" && "result" in payload) {
    return payload.result;
  }
  return payload;
}

export class StreamableHttpMcpClient {
  constructor(serverKey, serverConfig, options = {}) {
    this.serverKey = serverKey;
    this.config = serverConfig || {};
    this.baseUrl = this.config.baseUrl;
    this.headers = resolveHeaders(this.config.headers || {});
    this.sessionId = null;
    this.initTimeoutMs = options.initTimeoutMs || 15000;
    this.callTimeoutMs = options.callTimeoutMs || 60000;
    this.requestId = 0;
  }

  async request(method, params = undefined, timeoutMs = this.callTimeoutMs) {
    if (!this.baseUrl) {
      throw new Error(`MCP server ${this.serverKey} 缺少 baseUrl`);
    }

    const id = `${this.serverKey}-${++this.requestId}`;
    const body = {
      jsonrpc: "2.0",
      id,
      method,
    };
    if (params !== undefined) {
      body.params = params;
    }

    console.log(`🌐 [MCP:http] -> ${this.serverKey} ${method} id=${id} params=${safeJsonPreview(params || {}, 500)}`);
    const startedAt = Date.now();
    const response = await withTimeout((signal) => fetch(this.baseUrl, {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        ...(this.sessionId ? { "Mcp-Session-Id": this.sessionId } : {}),
        ...this.headers,
      },
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    }), timeoutMs, `MCP ${this.serverKey} ${method}`);
    const responseSessionId = response.headers.get("mcp-session-id");
    if (responseSessionId) {
      this.sessionId = responseSessionId;
    }

    const text = await response.text();
    console.log(`🌐 [MCP:http] <- ${this.serverKey} ${method} id=${id} status=${response.status} time=${Date.now() - startedAt}ms body=${safeJsonPreview(text, 500)}`);
    if (!response.ok) {
      throw new Error(`MCP ${this.serverKey} ${method} HTTP ${response.status}: ${text.slice(0, 500)}`);
    }

    const payload = parseMcpResponse(text, response.headers.get("content-type") || "");
    if (payload?.error) {
      const message = payload.error?.message || JSON.stringify(payload.error);
      throw new Error(`MCP ${this.serverKey} ${method} 返回错误: ${message}`);
    }
    return normalizeJsonRpcPayload(payload);
  }

  async notify(method, params = undefined, timeoutMs = this.callTimeoutMs) {
    if (!this.baseUrl) {
      throw new Error(`MCP server ${this.serverKey} 缺少 baseUrl`);
    }

    const body = {
      jsonrpc: "2.0",
      method,
    };
    if (params !== undefined) {
      body.params = params;
    }

    console.log(`🌐 [MCP:http] -> ${this.serverKey} ${method} notification`);
    const startedAt = Date.now();
    const response = await withTimeout((signal) => fetch(this.baseUrl, {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        ...(this.sessionId ? { "Mcp-Session-Id": this.sessionId } : {}),
        ...this.headers,
      },
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    }), timeoutMs, `MCP ${this.serverKey} ${method}`);
    console.log(`🌐 [MCP:http] <- ${this.serverKey} ${method} notification status=${response.status} time=${Date.now() - startedAt}ms`);
    if (!response.ok) {
      throw new Error(`MCP ${this.serverKey} ${method} notification HTTP ${response.status}`);
    }
  }

  async initialize() {
    const result = await this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "AI-Agent-Node",
        version: "1.0.0",
      },
    }, this.initTimeoutMs).catch((error) => {
      if (/Method not found|not found|initialize/i.test(error.message)) {
        return null;
      }
      throw error;
    });

    await this.notify("notifications/initialized", undefined, this.initTimeoutMs).catch(() => null);
    return result;
  }

  async listTools() {
    const result = await this.request("tools/list", {}, this.initTimeoutMs);
    return Array.isArray(result?.tools) ? result.tools : [];
  }

  async callTool(name, args = {}) {
    return this.request("tools/call", {
      name,
      arguments: args && typeof args === "object" ? args : {},
    }, this.callTimeoutMs);
  }
}

export function parseMcpResponse(text, contentType = "") {
  const trimmed = String(text || "").trim();
  if (!trimmed) {
    return null;
  }

  try {
    if (contentType.includes("text/event-stream") || trimmed.startsWith("event:") || trimmed.startsWith("data:")) {
      const events = trimmed.split(/\r?\n\r?\n/).map((eventBlock) => {
        const data = eventBlock
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .filter(Boolean)
          .join("\n");
        return data;
      }).filter(Boolean);
      const jsonLine = [...events].reverse().find((line) => line !== "[DONE]");
      return jsonLine ? JSON.parse(jsonLine) : null;
    }

    return JSON.parse(trimmed);
  } catch (error) {
    throw new Error(`MCP 响应解析失败: ${error.message}; body=${safeJsonPreview(trimmed, 300)}`);
  }
}
