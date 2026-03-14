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
- 如果Echart数据为有效的JSON格式，请直接输出如下内容:"我已经给你生成了关于${targetText}的图标,数据展示如下:\n${echartDataText}\n,数据来源于网络,仅供参考."，禁止输出任何多余的解释、说明文本，以便前端能够正确解析和渲染图表。
- 如果Echart数据是空对象或无效数据，请直接输出"暂无关于${targetText}的图表化的数据"。`;

    return echartDataContent;
  } catch (error) {
    return `Echart技能执行失败: ${error.message}`;
  }
}
