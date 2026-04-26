import assert from "node:assert/strict";
import test from "node:test";

import { parseMcpResponse } from "../mcp/client.js";
import { convertMcpToolToDefinitionForTest, initMcpTools } from "../mcp/registry.js";
import { CONFIG } from "../config.js";

const originalMcpEnabled = CONFIG.mcpEnabled;

test("MCP registry: disabled by default should not register tools", async () => {
  CONFIG.mcpEnabled = false;
  const result = await initMcpTools({ force: false });
  assert.equal(result.enabled, false);
  assert.deepEqual(result.registered, []);
  CONFIG.mcpEnabled = originalMcpEnabled;
});

test("MCP client: should parse json rpc response", () => {
  const payload = parseMcpResponse('{"jsonrpc":"2.0","id":"1","result":{"tools":[]}}', "application/json");
  assert.deepEqual(payload.result, { tools: [] });
});

test("MCP client: should parse event-stream response", () => {
  const payload = parseMcpResponse('event: message\ndata: {"jsonrpc":"2.0","id":"1","result":{"ok":true}}\n\n', "text/event-stream");
  assert.deepEqual(payload.result, { ok: true });
});

test("MCP client: should parse multi-line event-stream data", () => {
  const payload = parseMcpResponse('event: message\ndata: {"jsonrpc":"2.0",\ndata: "id":"1",\ndata: "result":{"ok":true}}\n\n', "text/event-stream");
  assert.deepEqual(payload.result, { ok: true });
});

test("MCP client: should wrap invalid response parse errors", () => {
  assert.throws(
    () => parseMcpResponse("not-json", "application/json"),
    /MCP 响应解析失败/
  );
});

test("MCP registry: should merge server and tool keywords into tool definition", async () => {
  const tool = convertMcpToolToDefinitionForTest({
    serverKey: "weather-server",
    serverConfig: {
      name: "Weather MCP",
      description: "气象服务",
      keywords: ["天气", "空气质量", "生活指数"],
    },
    mcpTool: {
      name: "forecast",
      description: "查询预报",
      keywords: ["降雨概率"],
      inputSchema: {
        type: "object",
        properties: {
          city: { type: "string", description: "城市名称", example: "北京" },
        },
        required: ["city"],
      },
    },
    client: {
      callTool: async () => ({ content: [{ type: "text", text: "ok" }] }),
    },
  });

  assert.equal(tool.source, "mcp");
  assert.ok(tool.keywords.includes("天气"));
  assert.ok(tool.keywords.includes("空气质量"));
  assert.ok(tool.keywords.includes("降雨概率"));
  assert.ok(tool.keywords.includes("城市名称"));
});

test("MCP registry: should generate unique names for non-ascii tool names", async () => {
  const base = {
    serverKey: "weather-server",
    serverConfig: { name: "Weather MCP", description: "气象服务" },
    client: { callTool: async () => ({ content: [] }) },
  };
  const toolA = convertMcpToolToDefinitionForTest({
    ...base,
    index: 0,
    mcpTool: { name: "精准天气实况", description: "查询天气", inputSchema: { type: "object", properties: {} } },
  });
  const toolB = convertMcpToolToDefinitionForTest({
    ...base,
    index: 1,
    mcpTool: { name: "历史天气", description: "查询历史天气", inputSchema: { type: "object", properties: {} } },
  });

  assert.notEqual(toolA.name, toolB.name);
  assert.match(toolA.name, /^mcp__weather-server__tool__[a-z0-9]+$/);
  assert.match(toolB.name, /^mcp__weather-server__tool__[a-z0-9]+$/);
});
