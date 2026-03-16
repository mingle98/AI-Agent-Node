// ========== AI Agent Echart技能 ==========

import dotenv from 'dotenv';
import axios from 'axios';
dotenv.config();

function safeJsonParse(text) {
  try {
    if (typeof text === "string") {
      return JSON.parse(text);
    }
    return text;
  } catch (error) {
    return {};
  }
}

async function callDashScope(targetText) {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  const appId = process.env.DASHSCOPE_APP_ID || "2d4d5282514146c8bb6a3be270456c43";

  const url = `https://dashscope.aliyuncs.com/api/v1/apps/${appId}/completion`;
  if (!apiKey) {
    throw new Error("DASHSCOPE_API_KEY is not set");
  }
  if (!appId) {
    throw new Error("DASHSCOPE_APP_ID is not set");
  }
  if (!targetText) {
    throw new Error("targetText is required");
  }
  console.log(`targetText: ${targetText}`);

  const data = {
        input: {
            prompt: targetText,
        },
        parameters: {},
        debug: {}
    };

    try {
        console.log('即将请求echart工作流....', targetText);
        const response = await axios.post(url, data, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.status === 200) {
            let mapDataRes = safeJsonParse(response.data.output?.text || '{}');
            let resData = mapDataRes?.data || {};
            console.log(`echartDataRes===>`, mapDataRes.data);
            return resData;
        } else {
            console.log(`request_id=${response.headers['request_id']}`);
            console.log(`code=${response.status}`);
            console.log(`message=${response.data.message}`);
            return {};
        }
    } catch (error) {
        console.error(`Error calling DashScope: ${error.message}`);
        if (error.response) {
            console.error(`Response status: ${error.response.status}`);
            console.error(`Response data: ${JSON.stringify(error.response.data, null, 2)}`);
        }
        return {};
    }
}

// callDashScope('2026年房价走势');

/**
   * AI Agent Echart技能 - 提供AI Agent相关数据可视化 
   * @param {string} targetText - 获取Echart数据的目标文本(例如: 2026年房价走势)
   * @returns {Promise<Object>} - Echart数据对象
   */
export async function skillAIAgentEchart(targetText) {
  try {
    console.log(`📊 AI Agent Echart: ${targetText}`);

    const echartData = await callDashScope(targetText);

    const echartDataText =
      typeof echartData === "string" ? echartData : JSON.stringify(echartData ?? {}, null, 2);

    const echartDataContent = `【Echart数据获取技能流程完成】

1)、关于[${targetText}]的Echart数据如下：

---
${echartDataText}
---

2)、输出说明：

- 如果Echart数据为有效的JSON格式，你必须按以下流程输出，使内容更易理解且仍可被前端渲染：
  1. 调用 analyze_chart 工具对 option 做一次结构化分析讲解与总结
     - arg1: 固定传 echarts
     - arg2: ECharts option JSON（即上面的 echartDataText）
     - arg3: 分析目标（建议传入："解释该图表表达的含义、关键指标/维度、可能的误读点，并给出总结"）
  2. 最终输出必须包含两部分，且顺序固定：
     - 先输出一个可渲染的 echarts 代码块（\`\`\`echarts ... \`\`\`），内容为原始 option JSON
     - 再输出 analyze_chart 返回的分析讲解与总结文本
  3. 允许在分析中补充必要说明（例如数据口径假设、维度解释、如何阅读图表），不再要求“只能输出固定句式”。
  4. 代码块必须保持为严格 JSON（不要在 JSON 内添加注释/尾逗号/非标准字段）。

- 如果Echart数据是空对象或无效数据，请直接输出："暂无关于${targetText}的图表化的数据"。`;

    return echartDataContent;
  } catch (error) {
    return `Echart技能执行失败: ${error.message}`;
  }
}
