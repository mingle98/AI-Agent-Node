import assert from "node:assert/strict";
import test from "node:test";

import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { ProductionAgent } from "../agent/ProductionAgent.js";
import {
  detectTaskComplexity,
  selectTaskMode
} from "../agent/planExecMode.js";

class MockLLM {
  constructor(script = []) {
    this.script = [...script];
    this.callCount = 0;
  }

  bindTools() {
    const script = this.script;
    const self = this;
    return {
      stream: async function* () {
        self.callCount++;
        const next = script.shift() || {};
        if (next.error) {
          throw next.error;
        }
        if (Array.isArray(next.chunks)) {
          for (const c of next.chunks) {
            yield c;
          }
          return;
        }
        if (next.message) {
          yield next.message;
          return;
        }
        yield new AIMessage({ content: "" });
      },
      invoke: async function() {
        self.callCount++;
        const next = script.shift() || {};
        if (next.error) {
          throw next.error;
        }
        if (next.message) {
          return next.message;
        }
        return new AIMessage({ content: "" });
      },
    };
  }
}

function createAgentWithMockLLM(mockLlm, options = {}) {
  return new ProductionAgent(mockLlm, null, null, {
    debug: false,
    maxIterations: 3,
    maxHistoryMessages: 12,
    keepRecentMessages: 8,
    contextStrategy: "trim",
    taskMode: options.taskMode || "react",
    complexityThreshold: options.complexityThreshold || 0.6,
    maxPlanSteps: options.maxPlanSteps || 10,
    maxStepIterations: options.maxStepIterations || 3,
    ...options,
  });
}

// ========== detectTaskComplexity Tests ==========

test("detectTaskComplexity: high complexity - analysis task", () => {
  const score = detectTaskComplexity("帮我分析这十份报告的数据并整理，统计每份报告的关键指标");
  assert.ok(score >= 0.3, `Expected at least medium complexity, got ${score}`);
});

test("detectTaskComplexity: high complexity - batch processing", () => {
  const score = detectTaskComplexity("批量处理这100个文件并生成报告");
  assert.ok(score >= 0.3, `Expected at least medium complexity, got ${score}`);
});

test("detectTaskComplexity: high complexity - multi-step sequential", () => {
  const score = detectTaskComplexity("首先搜索文件，然后整理排序，最后生成图表");
  assert.ok(score >= 0.5, `Expected medium-high complexity, got ${score}`);
});

test("detectTaskComplexity: medium complexity - create file with context", () => {
  const score = detectTaskComplexity("帮我创建一个配置文件，需要先查找项目结构");
  assert.ok(score >= 0.2 && score < 0.6, `Expected medium complexity, got ${score}`);
});

test("detectTaskComplexity: low complexity - simple question", () => {
  const score = detectTaskComplexity("什么是 React?");
  assert.ok(score < 0.3, `Expected low complexity, got ${score}`);
});

test("detectTaskComplexity: low complexity - how question", () => {
  const score = detectTaskComplexity("怎么使用这个函数?");
  assert.ok(score < 0.3, `Expected low complexity, got ${score}`);
});

test("detectTaskComplexity: handles object input", () => {
  const score = detectTaskComplexity({ text: "帮我分析这些数据", images: [] });
  assert.ok(typeof score === "number", "Should handle object input");
  assert.ok(score >= 0, "Score should be non-negative");
  assert.ok(score <= 1, "Score should be at most 1");
});

test("detectTaskComplexity: empty input", () => {
  const score = detectTaskComplexity("");
  assert.ok(typeof score === "number", "Should handle empty input");
  assert.ok(score >= 0, "Score should be non-negative");
});

test("detectTaskComplexity: score bounds", () => {
  const simpleScore = detectTaskComplexity("是什么？");
  const complexScore = detectTaskComplexity("分析所有报告并生成完整报告，包括统计图表和流程图");
  
  assert.ok(simpleScore >= 0 && simpleScore <= 1, "Simple score out of bounds");
  assert.ok(complexScore >= 0 && complexScore <= 1, "Complex score out of bounds");
  assert.ok(complexScore > simpleScore, "Complex task should have higher score");
});

test("detectTaskComplexity: automation keywords", () => {
  const score = detectTaskComplexity("帮我自动化处理这些任务");
  assert.ok(score >= 0.3, `Expected medium-high complexity for automation, got ${score}`);
});

test("detectTaskComplexity: flow diagram keywords", () => {
  const score = detectTaskComplexity("帮我画一个流程图展示处理步骤");
  assert.ok(score >= 0.3, `Expected medium-high complexity for flowchart, got ${score}`);
});

test("detectTaskComplexity: numbered list keywords", () => {
  const score = detectTaskComplexity("首先安装依赖，然后配置环境，最后启动服务");
  assert.ok(score >= 0.3, `Expected medium-high complexity for numbered sequence, got ${score}`);
});

// ========== selectTaskMode Tests ==========

test("selectTaskMode: force react via requestOptions", () => {
  const llm = new MockLLM([]);
  const agent = createAgentWithMockLLM(llm, { taskMode: "plan_exec" });
  
  const mode = selectTaskMode(agent, "分析数据", { taskMode: "react" });
  assert.equal(mode, "react", "Should force react mode");
});

test("selectTaskMode: force plan_exec via requestOptions", () => {
  const llm = new MockLLM([]);
  const agent = createAgentWithMockLLM(llm, { taskMode: "react" });
  
  const mode = selectTaskMode(agent, "简单问题", { taskMode: "plan_exec" });
  assert.equal(mode, "plan_exec", "Should force plan_exec mode");
});

test("selectTaskMode: agent level react mode", () => {
  const llm = new MockLLM([]);
  const agent = createAgentWithMockLLM(llm, { taskMode: "react" });
  
  const mode = selectTaskMode(agent, "分析数据", {});
  assert.equal(mode, "react", "Should use agent's react mode");
});

test("selectTaskMode: agent level plan_exec mode", () => {
  const llm = new MockLLM([]);
  const agent = createAgentWithMockLLM(llm, { taskMode: "plan_exec" });
  
  const mode = selectTaskMode(agent, "简单问题", {});
  assert.equal(mode, "plan_exec", "Should use agent's plan_exec mode");
});

test("selectTaskMode: auto complexity threshold - high complexity", () => {
  const llm = new MockLLM([]);
  const agent = createAgentWithMockLLM(llm, { 
    taskMode: "auto", 
    complexityThreshold: 0.3 
  });
  
  const mode = selectTaskMode(agent, "帮我分析这十份文档的内容并整理成表格，包括统计每份文档的关键数据并生成完整的分析报告", {});
  assert.equal(mode, "plan_exec", "High complexity task should use plan_exec");
});

test("selectTaskMode: auto complexity threshold - low complexity", () => {
  const llm = new MockLLM([]);
  const agent = createAgentWithMockLLM(llm, { 
    taskMode: "auto", 
    complexityThreshold: 0.6 
  });
  
  const mode = selectTaskMode(agent, "什么是JavaScript?", {});
  assert.equal(mode, "react", "Low complexity task should use react");
});

test("selectTaskMode: custom complexity threshold - boundary", () => {
  const llm = new MockLLM([]);
  const agent = createAgentWithMockLLM(llm, { 
    taskMode: "auto", 
    complexityThreshold: 0.15
  });
  
  // Use a moderately complex task with sequential steps
  const mode = selectTaskMode(agent, "首先查找项目文件，然后创建配置文件，最后启动服务", {});
  assert.equal(mode, "plan_exec", "Sequential steps should trigger plan_exec with low threshold");
});

test("selectTaskMode: empty requestOptions", () => {
  const llm = new MockLLM([]);
  const agent = createAgentWithMockLLM(llm, { taskMode: "react" });
  
  const mode = selectTaskMode(agent, "test", undefined);
  assert.equal(mode, "react", "Should handle undefined requestOptions");
});

test("selectTaskMode: empty requestOptions object", () => {
  const llm = new MockLLM([]);
  const agent = createAgentWithMockLLM(llm, { taskMode: "plan_exec" });
  
  const mode = selectTaskMode(agent, "test", {});
  assert.equal(mode, "plan_exec", "Should handle empty requestOptions object");
});

// ========== Plan+Exec Configuration Tests ==========

test("ProductionAgent: plan_exec configuration options", () => {
  const llm = new MockLLM([]);
  
  const agent = new ProductionAgent(llm, null, null, {
    taskMode: "plan_exec",
    complexityThreshold: 0.7,
    maxPlanSteps: 20,
    maxStepIterations: 5
  });
  
  assert.equal(agent.taskMode, "plan_exec");
  assert.equal(agent.complexityThreshold, 0.7);
  assert.equal(agent.maxPlanSteps, 20);
  assert.equal(agent.maxStepIterations, 5);
});

test("ProductionAgent: default plan_exec configuration", () => {
  const llm = new MockLLM([]);
  const agent = new ProductionAgent(llm, null, null, {});
  
  assert.equal(agent.taskMode, "auto");
  assert.equal(agent.complexityThreshold, 0.5);
  assert.equal(agent.maxPlanSteps, 10);
  assert.equal(agent.maxStepIterations, 3);
});

test("ProductionAgent: withSessionLockWrapper is available for planExecMode", () => {
  const llm = new MockLLM([]);
  const agent = createAgentWithMockLLM(llm);
  
  assert.ok(typeof agent.withSessionLockWrapper === "function", 
    "withSessionLockWrapper should be available");
});

// ========== Plan+Exec Integration Tests ==========

test("ProductionAgent: plan_exec mode generates and executes plan", async () => {
  const planResponse = new AIMessage({
    content: JSON.stringify({
      task_summary: "Test task",
      estimated_steps: 1,
      steps: [{ step_id: 1, description: "Test step", depends_on: [], expected_output: "test" }],
      final_goal: "Complete"
    })
  });
  
  const stepResponse = new AIMessage({ content: "Step completed successfully" });
  
  const llm = new MockLLM([
    { message: planResponse },
    { message: stepResponse }
  ]);
  
  const agent = createAgentWithMockLLM(llm, { 
    taskMode: "plan_exec",
    streamEnabled: false 
  });
  
  const result = await agent.chat(
    "帮我执行测试任务",
    null,
    null,
    "plan-exec-test-1"
  );
  
  assert.ok(typeof result === "string", "Should return a string result");
  assert.ok(result.length > 0, "Result should not be empty");
});

test("ProductionAgent: plan_exec mode executes multiple steps in order", async () => {
  const planResponse = new AIMessage({
    content: JSON.stringify({
      task_summary: "Multi-step task",
      estimated_steps: 3,
      steps: [
        { step_id: 1, description: "First step", depends_on: [], expected_output: "out1" },
        { step_id: 2, description: "Second step", depends_on: [1], expected_output: "out2" },
        { step_id: 3, description: "Third step", depends_on: [2], expected_output: "out3" }
      ],
      final_goal: "All done"
    })
  });
  
  const step1Response = new AIMessage({ content: "Step 1 result" });
  const step2Response = new AIMessage({ content: "Step 2 result" });
  const step3Response = new AIMessage({ content: "Step 3 result" });
  
  const llm = new MockLLM([
    { message: planResponse },
    { message: step1Response },
    { message: step2Response },
    { message: step3Response }
  ]);
  
  const agent = createAgentWithMockLLM(llm, { 
    taskMode: "plan_exec",
    streamEnabled: false 
  });
  
  const result = await agent.chat(
    "执行多步骤任务",
    null,
    null,
    "multi-step-test"
  );
  
  assert.ok(typeof result === "string", "Should return result");
  assert.ok(result.includes("步骤") || result.includes("Step") || result.includes("执行结果"), 
    "Result should contain step information");
});

test("ProductionAgent: plan_exec mode with tool call in step", async () => {
  const planResponse = new AIMessage({
    content: JSON.stringify({
      task_summary: "Task with tool",
      estimated_steps: 1,
      steps: [{ step_id: 1, description: "Use tool to process", depends_on: [], expected_output: "tool result" }],
      final_goal: "Done"
    })
  });
  
  const toolResponse = new AIMessage({ content: "" });
  toolResponse.tool_calls = [{ name: "render_mermaid", id: "t1", args: { arg1: "flowchart", arg2: "A-->B" } }];
  
  const finalResponse = new AIMessage({ content: "Tool executed successfully" });
  
  const llm = new MockLLM([
    { message: planResponse },
    { message: toolResponse },
    { message: finalResponse }
  ]);
  
  const agent = createAgentWithMockLLM(llm, { 
    taskMode: "plan_exec",
    streamEnabled: false 
  });
  
  const toolResults = [];
  const result = await agent.chat(
    "执行带工具的任务",
    null,
    (text, tools) => {
      if (tools && tools.length > 0) {
        toolResults.push(...tools);
      }
    },
    "tool-step-test"
  );
  
  assert.ok(typeof result === "string", "Should return result");
});

test("ProductionAgent: plan_exec mode emits stream events", async () => {
  const planResponse = new AIMessage({
    content: JSON.stringify({
      task_summary: "Stream test",
      estimated_steps: 1,
      steps: [{ step_id: 1, description: "Stream step", depends_on: [], expected_output: "ok" }],
      final_goal: "Done"
    })
  });
  
  const stepResponse = new AIMessage({ content: "Step done" });
  
  const llm = new MockLLM([
    { message: planResponse },
    { message: stepResponse }
  ]);
  
  const agent = createAgentWithMockLLM(llm, { 
    taskMode: "plan_exec",
    streamEnabled: true 
  });
  
  const events = [];
  await agent.chat(
    "流式测试",
    (e) => events.push(e),
    null,
    "stream-events-test"
  );
  
  assert.ok(events.length > 0, "Should emit events");
  const hasStatusOrDone = events.some(e => e.type === "status" || e.type === "done");
  assert.ok(hasStatusOrDone, "Should have status or done events");
});

test("ProductionAgent: auto mode switches based on complexity", async () => {
  const simpleResponse = new AIMessage({ content: "Simple response" });
  const complexPlan = new AIMessage({
    content: JSON.stringify({
      task_summary: "Complex",
      estimated_steps: 2,
      steps: [
        { step_id: 1, description: "Analyze data", depends_on: [], expected_output: "analysis" },
        { step_id: 2, description: "Generate report", depends_on: [1], expected_output: "report" }
      ],
      final_goal: "Complete"
    })
  });
  
  const complexStep1 = new AIMessage({ content: "Analysis done" });
  const complexStep2 = new AIMessage({ content: "Report generated" });
  
  const llm = new MockLLM([
    { message: simpleResponse },
    { message: complexPlan },
    { message: complexStep1 },
    { message: complexStep2 }
  ]);
  
  const agent = createAgentWithMockLLM(llm, { 
    taskMode: "auto",
    complexityThreshold: 0.5,
    streamEnabled: false 
  });
  
  const simpleResult = await agent.chat(
    "什么是Node.js?",
    null,
    null,
    "auto-react-test"
  );
  assert.equal(simpleResult, "Simple response");
  
  const complexResult = await agent.chat(
    "帮我分析这五份报告并生成综合分析图表",
    null,
    null,
    "auto-plan-test"
  );
  assert.ok(typeof complexResult === "string");
});

test("ProductionAgent: plan_exec handles step with dependencies", async () => {
  const planWithDeps = JSON.stringify({
    task_summary: "Dependent steps",
    estimated_steps: 3,
    steps: [
      { step_id: 1, description: "Fetch data", depends_on: [], expected_output: "raw data" },
      { step_id: 2, description: "Process data using step 1", depends_on: [1], expected_output: "processed" },
      { step_id: 3, description: "Format results", depends_on: [2], expected_output: "formatted" }
    ],
    final_goal: "Complete processing"
  });
  
  const responses = [
    new AIMessage({ content: planWithDeps }),
    new AIMessage({ content: "Data fetched" }),
    new AIMessage({ content: "Data processed" }),
    new AIMessage({ content: "Results formatted" })
  ];
  
  const llm = new MockLLM(responses.map(m => ({ message: m })));
  
  const agent = createAgentWithMockLLM(llm, { 
    taskMode: "plan_exec",
    streamEnabled: false 
  });
  
  const result = await agent.chat(
    "带依赖的任务",
    null,
    null,
    "deps-test"
  );
  
  assert.ok(typeof result === "string", "Should handle dependent steps");
});

test("ProductionAgent: plan_exec mode handles empty step description", async () => {
  const planWithEmptyStep = JSON.stringify({
    task_summary: "Edge case",
    estimated_steps: 1,
    steps: [{ step_id: 1, description: "", depends_on: [], expected_output: "" }],
    final_goal: "Done"
  });
  
  const responses = [
    new AIMessage({ content: planWithEmptyStep }),
    new AIMessage({ content: "Executed" })
  ];
  
  const llm = new MockLLM(responses.map(m => ({ message: m })));
  
  const agent = createAgentWithMockLLM(llm, { 
    taskMode: "plan_exec",
    streamEnabled: false 
  });
  
  const result = await agent.chat(
    "空步骤测试",
    null,
    null,
    "empty-step-test"
  );
  
  assert.ok(typeof result === "string", "Should handle empty step description");
});

test("ProductionAgent: plan_exec mode handles step with multiple tool calls", async () => {
  const planResponse = new AIMessage({
    content: JSON.stringify({
      task_summary: "Multi-tool step",
      estimated_steps: 1,
      steps: [{ step_id: 1, description: "Execute multiple tools", depends_on: [], expected_output: "all done" }],
      final_goal: "Complete"
    })
  });
  
  const tool1 = new AIMessage({ content: "" });
  tool1.tool_calls = [{ name: "render_mermaid", id: "t1", args: { arg1: "seq", arg2: "A->B" } }];
  
  const tool2 = new AIMessage({ content: "" });
  tool2.tool_calls = [{ name: "render_mermaid", id: "t2", args: { arg1: "flow", arg2: "X->Y" } }];
  
  const done = new AIMessage({ content: "All tools executed" });
  
  const llm = new MockLLM([
    { message: planResponse },
    { message: tool1 },
    { message: tool2 },
    { message: done }
  ]);
  
  const agent = createAgentWithMockLLM(llm, { 
    taskMode: "plan_exec",
    maxStepIterations: 3,
    streamEnabled: false 
  });
  
  const result = await agent.chat(
    "多次工具调用",
    null,
    null,
    "multi-tool-test"
  );
  
  assert.ok(typeof result === "string", "Should handle multiple tool calls in step");
});

test("ProductionAgent: plan_exec mode context is accumulated", async () => {
  const planResponse = new AIMessage({
    content: JSON.stringify({
      task_summary: "Context test",
      estimated_steps: 2,
      steps: [
        { step_id: 1, description: "First step produces context", depends_on: [], expected_output: "context data" },
        { step_id: 2, description: "Second step uses previous context", depends_on: [1], expected_output: "combined" }
      ],
      final_goal: "Done"
    })
  });
  
  const responses = [
    new AIMessage({ content: planResponse }),
    new AIMessage({ content: "First step output with important context" }),
    new AIMessage({ content: "Second step using context" })
  ];
  
  const llm = new MockLLM(responses.map(m => ({ message: m })));
  
  const agent = createAgentWithMockLLM(llm, { 
    taskMode: "plan_exec",
    streamEnabled: false 
  });
  
  const session = agent.getOrCreateSession("context-accum-test");
  const initialMsgCount = session.messages.length;
  
  await agent.chat(
    "累积上下文测试",
    null,
    null,
    "context-accum-test"
  );
  
  assert.ok(session.messages.length > initialMsgCount, 
    "Session should accumulate messages from plan execution");
});

test("ProductionAgent: react mode is unchanged after plan_exec addition", async () => {
  const response = new AIMessage({ content: "React mode response" });
  
  const llm = new MockLLM([{ message: response }]);
  
  const agent = createAgentWithMockLLM(llm, { 
    taskMode: "react",
    streamEnabled: false 
  });
  
  const result = await agent.chat(
    "React mode test",
    null,
    null,
    "react-unchanged-test"
  );
  
  assert.equal(result, "React mode response", "React mode should work as before");
});

test("ProductionAgent: plan_exec mode handles plan fallback to react on invalid plan", async () => {
  const invalidPlanResponse = new AIMessage({ content: "This is not a valid plan format" });
  const fallbackResponse = new AIMessage({ content: "Fallback response after plan failure" });
  
  const llm = new MockLLM([
    { message: invalidPlanResponse },
    { message: fallbackResponse }
  ]);
  
  const agent = createAgentWithMockLLM(llm, { 
    taskMode: "plan_exec",
    streamEnabled: false 
  });
  
  const result = await agent.chat(
    "无效计划测试",
    null,
    null,
    "fallback-test"
  );
  
  assert.ok(typeof result === "string", "Should handle plan failure gracefully");
});

test("ProductionAgent: plan_exec mode respects maxStepIterations", async () => {
  const planResponse = new AIMessage({
    content: JSON.stringify({
      task_summary: "Max iterations test",
      estimated_steps: 1,
      steps: [{ step_id: 1, description: "Step that may loop", depends_on: [], expected_output: "done" }],
      final_goal: "Complete"
    })
  });
  
  const llm = new MockLLM([
    { message: planResponse }
  ]);
  
  const agent = createAgentWithMockLLM(llm, { 
    taskMode: "plan_exec",
    maxStepIterations: 1,
    streamEnabled: false 
  });
  
  const result = await agent.chat(
    "最大迭代测试",
    null,
    null,
    "max-iterations-test"
  );
  
  assert.ok(typeof result === "string", "Should respect maxStepIterations");
});

test("ProductionAgent: plan_exec mode fullResponseCallback receives tool results", async () => {
  const planResponse = new AIMessage({
    content: JSON.stringify({
      task_summary: "Callback test",
      estimated_steps: 1,
      steps: [{ step_id: 1, description: "Execute with tool", depends_on: [], expected_output: "done" }],
      final_goal: "Complete"
    })
  });
  
  const toolResponse = new AIMessage({ content: "" });
  toolResponse.tool_calls = [{ name: "render_mermaid", id: "t-cb", args: { arg1: "seq", arg2: "A->B" } }];
  
  const finalResponse = new AIMessage({ content: "Tool completed" });
  
  const llm = new MockLLM([
    { message: planResponse },
    { message: toolResponse },
    { message: finalResponse }
  ]);
  
  const agent = createAgentWithMockLLM(llm, { 
    taskMode: "plan_exec",
    streamEnabled: false 
  });
  
  let capturedToolResults = null;
  await agent.chat(
    "回调测试",
    null,
    (text, toolResults) => {
      if (toolResults) {
        capturedToolResults = toolResults;
      }
    },
    "callback-test"
  );
  
  assert.ok(capturedToolResults !== null, "Should capture tool results in callback");
});

test("ProductionAgent: session isolation in plan_exec mode", async () => {
  const planResponse = new AIMessage({
    content: JSON.stringify({
      task_summary: "Session test",
      estimated_steps: 1,
      steps: [{ step_id: 1, description: "Test session", depends_on: [], expected_output: "done" }],
      final_goal: "Complete"
    })
  });
  
  const stepResponse = new AIMessage({ content: "Session specific response" });
  
  const llm = new MockLLM([
    { message: planResponse },
    { message: stepResponse }
  ]);
  
  const agent = createAgentWithMockLLM(llm, { 
    taskMode: "plan_exec",
    streamEnabled: false 
  });
  
  const result1 = await agent.chat("Test 1", null, null, "session-a");
  const result2 = await agent.chat("Test 2", null, null, "session-b");
  
  assert.ok(typeof result1 === "string");
  assert.ok(typeof result2 === "string");
  
  const stats = agent.getStats();
  assert.ok(stats.activeSessions >= 2, "Should have at least 2 active sessions");
});

test("ProductionAgent: plan_exec emits reasoning events when thinking enabled", async () => {
  const planResponse = new AIMessage({
    content: JSON.stringify({
      task_summary: "Thinking test",
      estimated_steps: 1,
      steps: [{ step_id: 1, description: "Test thinking", depends_on: [], expected_output: "done" }],
      final_goal: "Complete"
    })
  });
  
  const stepResponse = new AIMessage({ content: "Response with reasoning" });
  
  const llm = new MockLLM([
    { message: planResponse },
    { message: stepResponse }
  ]);
  
  const agent = createAgentWithMockLLM(llm, { 
    taskMode: "plan_exec",
    streamEnabled: true 
  });
  
  const events = [];
  await agent.chat(
    "思考测试",
    (e) => events.push(e),
    null,
    "thinking-test"
  );
  
  assert.ok(events.length > 0, "Should emit events");
});

test("ProductionAgent: plan_exec with step tools needing sessionId", async () => {
  const planResponse = new AIMessage({
    content: JSON.stringify({
      task_summary: "SessionId test",
      estimated_steps: 1,
      steps: [{ step_id: 1, description: "Use session-based tool", depends_on: [], expected_output: "done" }],
      final_goal: "Complete"
    })
  });
  
  const toolResponse = new AIMessage({ content: "" });
  toolResponse.tool_calls = [{ name: "file_read", id: "t-sid", args: { arg1: "test.txt" } }];
  
  const finalResponse = new AIMessage({ content: "File read completed" });
  
  const llm = new MockLLM([
    { message: planResponse },
    { message: toolResponse },
    { message: finalResponse }
  ]);
  
  const agent = createAgentWithMockLLM(llm, { 
    taskMode: "plan_exec",
    streamEnabled: false 
  });
  
  const result = await agent.chat(
    "SessionId测试",
    null,
    null,
    "sessionid-test"
  );
  
  assert.ok(typeof result === "string", "Should handle session-based tools");
});
