// ========== Plan+Exec 架构模式 ==========
// 独立模块，负责复杂任务的规划和分步执行

import { SystemMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";

import { getPlanPhaseDivBox, getPlanStepDivBox, getToolDivBox } from "../utils/streamRenderer.js";

// 评估与模式选择实现见 complexityEvaluator.js；此处仅重导出，避免 import + export 同名导致重复导出
export {
  selectTaskMode,
  detectTaskComplexity,
  detectTaskComplexitySync
} from "./complexityEvaluator.js";

/**
 * 发送流式事件
 */
function emitStreamEvent(callback, payload) {
  if (!callback || !payload || typeof payload !== "object") {
    return;
  }
  callback(payload);
}

/**
 * 发送工具执行事件
 */
function emitToolEvent(callback, toolExcResult) {
  if (!callback || !toolExcResult) {
    return;
  }
  try {
    callback(null, toolExcResult);
  } catch (error) {
    // ignore callback errors
  }
}

/**
 * 规范化文本内容
 */
function normalizeTextContent(content) {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content.map((part) => (typeof part === "string" ? part : (part?.text || ""))).join("");
  }
  return String(content || "");
}

/**
 * 构建计划生成的系统提示
 */
function buildPlanSystemPrompt(getStructuredTools, maxPlanSteps) {
  const tools = getStructuredTools();
  const toolsList = tools.map(t => {
    const fn = t.function;
    return `- ${fn.name}: ${fn.description}`;
  }).join('\n');

  return `你是一个任务规划专家。你的职责是将用户的复杂任务分解为可执行的步骤计划。

## 可用工具/技能：
${toolsList}

## 计划生成规则：
1. 分析用户需求，将任务分解为清晰的步骤
2. 每个步骤应该是一个原子操作或短流程
3. 步骤之间保持顺序依赖关系
4. 考虑步骤之间的信息传递（前面步骤的结果如何用于后续步骤）
5. 预估每个步骤可能需要的工具或操作

## 输出格式：
请以 JSON 格式输出计划，结构如下：
{
  "task_summary": "任务概述",
  "estimated_steps": 预计步骤数,
  "steps": [
    {
      "step_id": 1,
      "description": "步骤描述",
      "tool_name": "使用的工具名称（可选）",
      "depends_on": [],
      "expected_output": "预期输出"
    }
  ],
  "final_goal": "最终目标"
}

重要：
- 如果任务过于复杂，可以增加更多细粒度的步骤
- 如果一个步骤需要多次工具调用，可以在 description 中描述
- 步骤数建议控制在 ${maxPlanSteps} 个以内`;
}

/**
 * 解析 LLM 返回的计划文本
 */
function parsePlan(planText) {
  try {
    const jsonMatch = planText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.steps && Array.isArray(parsed.steps)) {
        return parsed;
      }
    }

    const lines = planText.split('\n').filter(l => l.trim());
    const steps = [];
    let currentStep = null;

    for (const line of lines) {
      const stepMatch = line.match(/^(\d+)[\.、:：]\s*(.+)/);
      if (stepMatch) {
        if (currentStep) steps.push(currentStep);
        currentStep = {
          step_id: parseInt(stepMatch[1]),
          description: stepMatch[2].trim(),
          depends_on: [],
          expected_output: ""
        };
      }
    }
    if (currentStep) steps.push(currentStep);

    if (steps.length > 0) {
      return {
        task_summary: "从文本解析的任务",
        estimated_steps: steps.length,
        steps,
        final_goal: "完成所有步骤"
      };
    }

    return null;
  } catch (error) {
    console.error(`解析计划失败: ${error.message}`);
    return null;
  }
}

/**
 * 生成任务执行计划
 */
async function generatePlan(agent, userInput, session, chunkCallback, streamEnabled) {
  const text = typeof userInput === "string" ? userInput : (userInput?.text || "");
  const planSystemPrompt = buildPlanSystemPrompt(
    () => agent.getStructuredTools(),
    agent.maxPlanSteps
  );

  const planMessages = [
    new SystemMessage(planSystemPrompt),
    new HumanMessage(`请为以下任务生成执行计划：\n\n${text}`)
  ];

  console.log(`📋 [Plan+Exec] 正在生成任务计划...`);

  if (streamEnabled) {
    emitStreamEvent(chunkCallback, {
      type: "status",
      content: getPlanPhaseDivBox('📋 【PLAN】正在分析任务并生成执行计划...', 'start')
    });
  }

  try {
    const { message: planResponse } = await agent.invokeLLMWithResilience(
      session,
      planMessages,
      { streamEnabled: false }
    );

    const planText = normalizeTextContent(planResponse.content);
    console.log(`📋 [Plan+Exec] 生成的计划:\n${planText}`);

    const plan = parsePlan(planText);

    if (!plan || !plan.steps || plan.steps.length === 0) {
      throw new Error("无法生成有效的执行计划");
    }

    if (streamEnabled) {
      emitStreamEvent(chunkCallback, {
        type: "status",
        content: getPlanPhaseDivBox(`✅ 【PLAN】计划生成完成，共 ${plan.steps.length} 个步骤`, 'end')
      });
    }

    return plan;
  } catch (error) {
    console.error(`❌ [Plan+Exec] 计划生成失败: ${error.message}`);
    if (streamEnabled) {
      emitStreamEvent(chunkCallback, {
        type: "status",
        content: getPlanPhaseDivBox(`⚠️ 【PLAN】计划生成失败，将使用传统模式: ${error.message}`, 'end')
      });
    }
    return null;
  }
}

/**
 * 执行单个计划步骤
 */
async function executePlanStep(agent, session, step, stepContext, chunkCallback, streamEnabled) {
  const stepId = step.step_id || 0;
  const description = step.description || "";
  const stepMaxIterations = agent.maxStepIterations;

  console.log(`\n${'='.repeat(50)}`);
  console.log(`📌 [Plan+Exec] 执行步骤 ${stepId}: ${description}`);
  console.log(`${'='.repeat(50)}\n`);

  if (streamEnabled) {
    emitStreamEvent(chunkCallback, {
      type: "status",
      content: getPlanStepDivBox(`🔹 【步骤 ${stepId}】${description}`, 'start')
    });
  }

  const stepMessage = `请执行以下步骤：\n\n${description}\n\n${stepContext ? `前置上下文：\n${stepContext}\n\n` : ""}请思考并调用必要的工具来完成这个步骤。如果需要多次工具调用，请继续直到完成。`;

  session.messages.push(new HumanMessage(stepMessage));

  let iterations = 0;
  let stepResult = "";
  const toolExcResults = [];

  while (iterations < stepMaxIterations) {
    iterations += 1;

    const { message: aiResponse } = await agent.invokeLLMWithResilience(
      session,
      session.messages,
      {
        streamEnabled,
        onChunk: streamEnabled ? (chunk) => {
          if (chunk?.reasoning) {
            emitStreamEvent(chunkCallback, { type: "reasoning", content: chunk.reasoning });
          }
          if (chunk?.content) {
            emitStreamEvent(chunkCallback, { type: "chunk", content: chunk.content });
            stepResult += chunk.content;
          }
        } : null
      }
    );

    const toolCalls = aiResponse.tool_calls || [];
    const aiText = normalizeTextContent(aiResponse.content);

    session.messages.push(aiResponse);

    if (toolCalls.length === 0) {
      stepResult = aiText;
      break;
    }

    for (const toolCall of toolCalls) {
      if (streamEnabled) {
        emitStreamEvent(chunkCallback, {
          type: "status",
          content: getToolDivBox(`🚀 【步骤 ${stepId}】执行 ${toolCall.name}...`)
        });
      }

      const callable = agent.callableDefinitions.get(toolCall.name);
      const startAt = Date.now();
      const result = await agent.executeCallableWithResilience(
        session,
        toolCall.name,
        toolCall.args || {}
      );
      const endAt = Date.now();

      const toolExcResult = {
        toolName: toolCall.name,
        kind: callable?.kind || "tool",
        params: toolCall.args || {},
        toolCallId: toolCall.id,
        result,
        startAt,
        endAt,
        durationMs: endAt - startAt,
        ok: !(typeof result === "string" && result.includes("执行失败")),
        stepId
      };
      toolExcResults.push(toolExcResult);
      emitToolEvent(chunkCallback, toolExcResult);

      const content = typeof result === "string" ? result : JSON.stringify(result, null, 2);

      if (streamEnabled) {
        emitStreamEvent(chunkCallback, {
          type: "status",
          content: getToolDivBox(`✅ 【步骤 ${stepId}】${toolCall.name} 完成`, 'end')
        });
      }

      session.messages.push(new ToolMessage({
        content,
        tool_call_id: toolCall.id,
      }));
    }
  }

  console.log(`✅ [Plan+Exec] 步骤 ${stepId} 完成`);
  if (streamEnabled) {
    emitStreamEvent(chunkCallback, {
      type: "status",
      content: getPlanStepDivBox(`✅ 【步骤 ${stepId}】完成`, 'end')
    });
  }

  // 执行完每个步骤后，管理一次上下文以防止消息列表无限增长
  await agent.manageContext(session);

  return {
    stepId,
    description,
    result: stepResult,
    toolResults: toolExcResults,
    iterationsUsed: iterations
  };
}

/**
 * 执行完整计划
 */
async function executePlan(agent, plan, session, chunkCallback, streamEnabled) {
  const steps = plan.steps || [];
  const allResults = [];
  let accumulatedContext = "";

  console.log(`\n🚀 [Plan+Exec] 开始执行计划，共 ${steps.length} 个步骤\n`);

  if (streamEnabled) {
    emitStreamEvent(chunkCallback, {
      type: "status",
      content: getPlanPhaseDivBox(`🚀 【PLAN】开始执行计划，共 ${steps.length} 个步骤`, 'start')
    });
  }

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];

    if (step.depends_on && step.depends_on.length > 0) {
      const depsCompleted = step.depends_on.every(depId =>
        allResults.some(r => r.stepId === depId)
      );
      if (!depsCompleted) {
        console.warn(`⚠️ [Plan+Exec] 步骤 ${step.step_id} 的前置依赖未完成，跳过`);
        continue;
      }
      accumulatedContext = step.depends_on.map(depId => {
        const depResult = allResults.find(r => r.stepId === depId);
        return depResult ? `[步骤${depId}] ${depResult.description}:\n${depResult.result}` : "";
      }).filter(Boolean).join('\n\n');
    }

    const stepResult = await executePlanStep(
      agent,
      session,
      step,
      accumulatedContext,
      chunkCallback,
      streamEnabled
    );

    allResults.push(stepResult);

    accumulatedContext = allResults.map(r =>
      `[步骤${r.stepId}] ${r.description}:\n${r.result}`
    ).join('\n\n');
  }

  console.log(`\n🎉 [Plan+Exec] 计划执行完成！\n`);

  const finalSummary = generatePlanSummary(plan, allResults);

  if (streamEnabled) {
    emitStreamEvent(chunkCallback, {
      type: "status",
      content: getPlanPhaseDivBox(`🎉 【PLAN】计划执行完成！`, 'end')
    });
  }

  return {
    plan,
    results: allResults,
    finalSummary
  };
}

/**
 * 生成计划执行总结
 */
function generatePlanSummary(plan, results) {
  let summary = plan.task_summary ? `${plan.task_summary}\n\n` : "";
  summary += "## 执行结果汇总\n\n";

  for (const result of results) {
    summary += `### 步骤 ${result.stepId}: ${result.description}\n`;
    summary += `${result.result || "[无输出]"}\n\n`;
  }

  if (plan.final_goal) {
    summary += `---\n\n**最终目标**: ${plan.final_goal}`;
  }

  return summary;
}

/**
 * Plan+Exec 模式执行入口
 */
export async function chatWithPlanExec(agent, userInput, chunkCallback, fullResponseCallback, sessionId, requestOptions) {
  const session = agent.getOrCreateSession(sessionId);
  const streamEnabled = requestOptions?.streamEnabled ?? true;

  return agent.withSessionLockWrapper(async () => {
    try {
      agent.touchSession(session);

      // ========== 长期记忆注入（首次对话或有记忆文件时） ==========
      if (agent.longTermMemory) {
        try {
          const hasMemory = await agent.longTermMemory.hasMemoryFile(sessionId);
          if (hasMemory) {
            await agent.longTermMemory.injectMemory(sessionId, session);
          }
        } catch (error) {
          console.warn(`⚠️ [记忆] ${sessionId} 记忆注入失败: ${error.message}`);
        }
      }

      // 构建并记录用户消息（关键：保持与 chatWithReAct 一致的上下文处理）
      const addMessage = agent.buildHumanMessage(userInput);
      if (agent.options.debug) {
        console.log(`👤 [${sessionId}] 用户消息:`, addMessage.toString());
      }
      session.messages.push(addMessage);
      await agent.manageContext(session);

      const logText = typeof userInput === "string" ? userInput : (userInput?.text || "[多模态输入]");
      console.log(`👤 [${sessionId}] 用户: ${logText}`);

      const plan = await generatePlan(agent, userInput, session, chunkCallback, streamEnabled);

      if (!plan) {
        console.log(`⚠️ [Plan+Exec] 计划生成失败，回退到 ReAct 模式`);
        return agent.chatWithReAct(userInput, chunkCallback, fullResponseCallback, sessionId, requestOptions);
      }

      const { results, finalSummary } = await executePlan(
        agent,
        plan,
        session,
        chunkCallback,
        streamEnabled
      );

      const allToolResults = results.flatMap(r => r.toolResults || []);

      // ========== 长期记忆更新检查 ==========
      if (agent.longTermMemory) {
        try {
          await agent.longTermMemory.checkAndUpdateMemory(sessionId, session);
        } catch (error) {
          console.warn(`⚠️ [记忆] ${sessionId} 记忆更新失败: ${error.message}`);
        }
      }

      if (streamEnabled) {
        emitStreamEvent(chunkCallback, {
          type: "done",
          content: finalSummary,
          finalText: finalSummary,
          planResults: results
        });
      }
      fullResponseCallback?.(finalSummary, allToolResults);
      return finalSummary;

    } catch (error) {
      const errorMessage = error?.message || "未知错误";
      const fallbackText = "抱歉，任务执行过程中出现错误，请稍后重试。";
      console.error(`❌ [Plan+Exec] 执行失败: ${errorMessage}`);

      // ========== 长期记忆更新检查（即使出错也检查） ==========
      if (agent.longTermMemory) {
        try {
          await agent.longTermMemory.checkAndUpdateMemory(sessionId, session);
        } catch (error) {
          console.warn(`⚠️ [记忆] ${sessionId} 记忆更新失败: ${error.message}`);
        }
      }

      if (streamEnabled) {
        emitStreamEvent(chunkCallback, {
          type: "error",
          content: "",
          message: errorMessage,
        });
        emitStreamEvent(chunkCallback, {
          type: "done",
          content: fallbackText,
          finalText: fallbackText,
        });
        fullResponseCallback?.(fallbackText, []);
        return fallbackText;
      }

      fullResponseCallback?.(fallbackText, []);
      return fallbackText;
    }
  });
}
