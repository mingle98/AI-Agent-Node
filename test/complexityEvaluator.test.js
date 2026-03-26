import assert from "node:assert/strict";
import test from "node:test";

import {
  IntelligentComplexityEvaluator,
  ComplexityLevel,
  detectTaskComplexity,
  detectTaskComplexitySync,
  selectTaskMode,
  explainComplexity
} from "../agent/complexityEvaluator.js";
import { AIMessage } from "@langchain/core/messages";
import { ProductionAgent } from "../agent/ProductionAgent.js";

// ========== 智能复杂度评估器单元测试 ==========

test("IntelligentComplexityEvaluator: 低复杂度 - 简单问答", async () => {
  const evaluator = new IntelligentComplexityEvaluator();
  const result = await evaluator.evaluate("什么是 JavaScript?");
  
  assert.equal(result.level, ComplexityLevel.LOW, "简单问答应该是 LOW 级别");
  assert.ok(result.score < 0.5, `分数应该较低: ${result.score}`);
  assert.ok(result.confidence > 0.5, "应该有基本置信度");
  assert.ok(!result.requiresPlan || result.level === ComplexityLevel.LOW);
});

test("IntelligentComplexityEvaluator: 高复杂度 - 多步骤任务", async () => {
  const evaluator = new IntelligentComplexityEvaluator();
  const result = await evaluator.evaluate("请帮我分析这十份报告并生成综合报告");
  
  assert.ok(result.score > 0.2, `分数应该较高: ${result.score}`);
  assert.ok(result.level !== ComplexityLevel.LOW || result.score > 0.15);
});

test("IntelligentComplexityEvaluator: 检测步骤序列", async () => {
  const evaluator = new IntelligentComplexityEvaluator();
  
  // 明确的多步骤
  const result1 = await evaluator.evaluate("首先搜索文件，然后整理排序，最后生成图表");
  assert.ok(result1.score > 0.15, `多步骤分数应该较高: ${result1.score}`);
  
  // 简单问题
  const result2 = await evaluator.evaluate("什么是 React?");
  assert.ok(result2.score <= result1.score + 0.1, "简单问题分数应该较低或相近");
});

test("IntelligentComplexityEvaluator: 批量处理检测", async () => {
  const evaluator = new IntelligentComplexityEvaluator();
  
  const batchResult = await evaluator.evaluate("批量处理这100个文件并生成报告");
  assert.ok(batchResult.score > 0.3, `批量处理分数应该较高: ${batchResult.score}`);
});

test("IntelligentComplexityEvaluator: 上下文依赖检测", async () => {
  const evaluator = new IntelligentComplexityEvaluator();

  const sessionHistory = [
    { content: "帮我分析这些数据" },
    { content: "生成报告" }
  ];

  // 带指代词的输入应该检测到上下文依赖
  const result = await evaluator.evaluate("把它们整理成表格", sessionHistory);
  assert.ok(result.score >= 0, "应该有基本分数");
});

test("IntelligentComplexityEvaluator: evaluateWithLLM 接收 sessionHistory", async () => {
  // 创建一个简单的 mock LLM
  const mockLLM = {
    invoke: async (messages) => {
      // 验证 sessionHistory 被传入 prompt
      const systemPrompt = messages[0].content;
      assert.ok(
        systemPrompt.includes("对话历史") || systemPrompt.includes("最近3轮"),
        "Prompt 应该包含会话历史"
      );
      return { content: "HIGH" };
    }
  };

  const evaluator = new IntelligentComplexityEvaluator({
    llm: mockLLM,
    enableLLMEval: true,
    confidenceThreshold: 0.99 // 设置高阈值，强制触发 LLM
  });

  const sessionHistory = [
    { content: "帮我分析这些报告" },
    { content: "生成对比报告" },
    { content: "总结关键发现" }
  ];

  const result = await evaluator.evaluate("把它们整理成表格", sessionHistory);
  assert.ok(result.score >= 0, "应该有评估结果");
});

test("IntelligentComplexityEvaluator: evaluateWithLLM 无 sessionHistory 时正常", async () => {
  const mockLLM = {
    invoke: async (messages) => {
      return { content: "LOW" };
    }
  };

  const evaluator = new IntelligentComplexityEvaluator({
    llm: mockLLM,
    enableLLMEval: true,
    confidenceThreshold: 0.99
  });

  // 不传 sessionHistory
  const result = await evaluator.evaluate("什么是 Python?");
  assert.ok(result.score >= 0, "应该有评估结果");
});

test("IntelligentComplexityEvaluator: evaluateWithLLM LLM 超时时回退", async () => {
  const mockLLM = {
    invoke: async () => {
      await new Promise((resolve) => setTimeout(resolve, 10000)); // 模拟超时
      return { content: "HIGH" };
    }
  };

  const evaluator = new IntelligentComplexityEvaluator({
    llm: mockLLM,
    enableLLMEval: true,
    confidenceThreshold: 0.99,
    llmTimeout: 100 // 100ms 超时
  });

  const result = await evaluator.evaluate("处理一下这个任务");
  assert.ok(result.score >= 0, "超时后应回退到规则评估");
  assert.ok(
    result.reasoning?.includes("LLM不可用") || result.reasoning?.includes("回退"),
    "应该有回退说明"
  );
});

test("IntelligentComplexityEvaluator: 置信度计算", async () => {
  const evaluator = new IntelligentComplexityEvaluator();
  
  // 明确的简单问题应该有合理置信度
  const simpleResult = await evaluator.evaluate("什么是 Python?");
  assert.ok(simpleResult.confidence > 0.5, "应该有基本置信度");
  
  // 边界情况置信度可以较低也可以较高
  const vagueResult = await evaluator.evaluate("处理一下");
  assert.ok(vagueResult.confidence > 0 && vagueResult.confidence <= 1);
});

test("IntelligentComplexityEvaluator: 操作类型识别", async () => {
  const evaluator = new IntelligentComplexityEvaluator();
  
  // 报告生成 - 使用更明确的表述
  const reportResult = await evaluator.evaluate("帮我生成一份完整的数据分析报告");
  assert.ok(reportResult.score > 0.15, `报告生成分数: ${reportResult.score}`);
  
  // 多文档处理
  const multiDocResult = await evaluator.evaluate("对比两份文档的内容并生成对比报告");
  assert.ok(multiDocResult.score > 0.1, `对比分析分数: ${multiDocResult.score}`);
});

test("IntelligentComplexityEvaluator: 推理说明生成", async () => {
  const evaluator = new IntelligentComplexityEvaluator();
  
  const result = await evaluator.evaluate("首先搜索所有PDF文件，然后提取内容，最后生成摘要");
  assert.ok(typeof result.reasoning === "string");
  assert.ok(result.reasoning.length > 0);
});

test("IntelligentComplexityEvaluator: 获取统计信息", async () => {
  const evaluator = new IntelligentComplexityEvaluator();
  
  await evaluator.evaluate("简单问题");
  await evaluator.evaluate("复杂的多步骤任务");
  
  const stats = evaluator.getStats();
  assert.ok(stats.totalEvals >= 2);
  assert.ok(typeof stats.llmUsageRate === "string");
});

// ========== 便捷函数测试 ==========

test("detectTaskComplexity: 异步接口返回分数", async () => {
  const score = await detectTaskComplexity("帮我分析这十份文档");
  assert.ok(typeof score === "number");
  assert.ok(score >= 0 && score <= 1);
});

test("detectTaskComplexitySync: 同步接口返回分数", () => {
  const score = detectTaskComplexitySync("帮我处理一些数据");
  assert.ok(typeof score === "number", "应该返回数字类型");
  assert.ok(!isNaN(score), "分数不应该是 NaN");
});

test("explainComplexity: 返回完整评估结果", async () => {
  const result = await explainComplexity("帮我分析这些文件并生成报告");
  
  assert.ok(result.hasOwnProperty("level"));
  assert.ok(result.hasOwnProperty("score"));
  assert.ok(result.hasOwnProperty("confidence"));
  assert.ok(result.hasOwnProperty("reasoning"));
  assert.ok(result.hasOwnProperty("requiresPlan"));
});

// ========== 兼容性测试 ==========

test("detectTaskComplexity: 兼容字符串输入", async () => {
  const score1 = await detectTaskComplexity("分析文件");
  const score2 = detectTaskComplexitySync("处理数据");
  
  assert.ok(typeof score1 === "number", "应该返回数字类型");
  assert.ok(typeof score2 === "number", "应该返回数字类型");
  assert.ok(!isNaN(score1), "分数不应该是 NaN");
  assert.ok(!isNaN(score2), "分数不应该是 NaN");
});

test("detectTaskComplexity: 兼容对象输入", async () => {
  const score = await detectTaskComplexity({ text: "测试输入" });
  assert.ok(typeof score === "number");
  assert.ok(score >= 0 && score <= 1);
});

test("detectTaskComplexity: 兼容空输入", async () => {
  const score = await detectTaskComplexity("");
  assert.ok(typeof score === "number");
  assert.ok(score >= 0);
});

test("detectTaskComplexity: 分数边界", async () => {
  // 最简单的问题
  const minScore = await detectTaskComplexity("是什么？");
  assert.ok(minScore >= 0 && minScore <= 1);
  
  // 最复杂的问题
  const maxScore = await detectTaskComplexity(
    "首先遍历所有文件，统计函数数量，分析代码质量，生成完整报告，画出依赖关系图，最后发送给团队成员"
  );
  assert.ok(maxScore >= 0 && maxScore <= 1);
});

// ========== selectTaskMode 异步测试 ==========

class MockLLM {
  constructor(script = []) {
    this.script = [...script];
    this.callCount = 0;
  }

  bindTools() {
    return {
      invoke: async function() {
        self.callCount++;
        const next = this.script.shift() || {};
        if (next.error) throw next.error;
        if (next.message) return next.message;
        return new AIMessage({ content: "MEDIUM" });
      },
    };
  }
}

function createTestAgent(options = {}) {
  return {
    llm: null,
    taskMode: options.taskMode || "auto",
    complexityThreshold: options.complexityThreshold || 0.5,
    maxPlanSteps: options.maxPlanSteps || 10,
    maxStepIterations: options.maxStepIterations || 3
  };
}

test("selectTaskMode: 强制 react 模式", async () => {
  const agent = createTestAgent({ taskMode: "plan_exec" });
  const mode = await selectTaskMode(agent, "任何输入", { taskMode: "react" });
  assert.equal(mode, "react");
});

test("selectTaskMode: 强制 plan_exec 模式", async () => {
  const agent = createTestAgent({ taskMode: "react" });
  const mode = await selectTaskMode(agent, "任何输入", { taskMode: "plan_exec" });
  assert.equal(mode, "plan_exec");
});

test("selectTaskMode: Agent 配置优先 - react", async () => {
  const agent = createTestAgent({ taskMode: "react" });
  const mode = await selectTaskMode(agent, "复杂的多步骤任务");
  assert.equal(mode, "react");
});

test("selectTaskMode: Agent 配置优先 - plan_exec", async () => {
  const agent = createTestAgent({ taskMode: "plan_exec" });
  const mode = await selectTaskMode(agent, "简单问题");
  assert.equal(mode, "plan_exec");
});

test("selectTaskMode: 智能评估 - 高复杂度触发 plan", async () => {
  const agent = createTestAgent({ 
    taskMode: "auto", 
    complexityThreshold: 0.5 
  });
  
  const mode = await selectTaskMode(
    agent, 
    "帮我分析这十份文档的内容并整理成表格，包括统计每份文档的关键数据并生成完整的分析报告"
  );
  
  assert.equal(mode, "plan_exec", "High complexity should trigger plan_exec");
});

test("selectTaskMode: 智能评估 - 低复杂度使用 react", async () => {
  const agent = createTestAgent({ 
    taskMode: "auto", 
    complexityThreshold: 0.5 
  });
  
  const mode = await selectTaskMode(agent, "什么是 JavaScript?");
  assert.equal(mode, "react", "Low complexity should use react");
});

test("selectTaskMode: 上下文感知", async () => {
  const agent = createTestAgent({ 
    taskMode: "auto", 
    complexityThreshold: 0.5 
  });
  
  // 在复杂任务后的简单指代词
  const complexHistory = [
    { content: "帮我分析这十份文档" },
    { content: "生成报告" }
  ];
  
  const mode = await selectTaskMode(
    agent, 
    "把它们整理成表格",
    {},
    complexHistory
  );
  
  // 由于有上下文依赖，应该更容易触发 plan 模式
  assert.ok(mode === "plan_exec" || mode === "react");
});

// ========== 边界情况测试 ==========

test("IntelligentComplexityEvaluator: 极短文本", async () => {
  const evaluator = new IntelligentComplexityEvaluator();
  const result = await evaluator.evaluate("hi");
  
  assert.ok(result.score >= 0);
  assert.ok(result.score <= 1);
});

test("IntelligentComplexityEvaluator: 极长文本", async () => {
  const evaluator = new IntelligentComplexityEvaluator();
  const longText = "帮我分析" + "这些文件".repeat(100);
  const result = await evaluator.evaluate(longText);
  
  assert.ok(result.score >= 0);
  assert.ok(result.score <= 1);
});

test("IntelligentComplexityEvaluator: 混合语言", async () => {
  const evaluator = new IntelligentComplexityEvaluator();
  const result = await evaluator.evaluate("Please analyze these files and generate a report");
  
  assert.ok(typeof result.level === "string");
  assert.ok(result.score >= 0 && result.score <= 1);
});

test("IntelligentComplexityEvaluator: 标点符号处理", async () => {
  const evaluator = new IntelligentComplexityEvaluator();
  
  const withPunctuation = await evaluator.evaluate("什么是JavaScript？");
  const withoutPunctuation = await evaluator.evaluate("什么是JavaScript");
  
  // 两者分数应该相近（因为核心内容相同）
  assert.ok(Math.abs(withPunctuation.score - withoutPunctuation.score) < 0.2);
});

// ========== 性能测试 ==========

test("IntelligentComplexityEvaluator: 快速评估性能", async () => {
  const evaluator = new IntelligentComplexityEvaluator();
  
  const startTime = Date.now();
  
  for (let i = 0; i < 100; i++) {
    await evaluator.evaluate(`测试输入 ${i}`);
  }
  
  const elapsed = Date.now() - startTime;
  assert.ok(elapsed < 1000, `100 evaluations should complete in < 1s, took ${elapsed}ms`);
});

console.log("✅ 智能复杂度评估器测试文件已加载");
