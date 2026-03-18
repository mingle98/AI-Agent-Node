// ========== Python 脚本执行器技能（LLM 驱动代码生成 + 执行 + 结果处理） ==========

import { execCode } from '../tools/execCode.js';
import { generatePythonScript, analyzeScriptResult, checkScriptSafety, setScriptGeneratorLLM as setLLM } from '../tools/scriptGenerator.js';

// 为了保持向后兼容，仍然导出 setScriptGeneratorLLM
export { setLLM as setScriptGeneratorLLM };

/**
 * Python 脚本执行器技能
 * 架构：LLM 理解需求 → 生成脚本 → 安全检查 → 执行 → 分析结果
 * @param {string} task - 任务描述
 * @param {string} dataInput - 输入数据
 * @param {string} outputFormat - 期望输出格式
 * @returns {Promise<string>} - 执行结果和分析报告
 */
export async function skillPythonExecutor(task, dataInput = "", outputFormat = "summary") {
  try {
    console.log(`🐍 Python 脚本执行器: ${task}`);

    // Step 1: LLM 生成 Python 脚本（使用 script_generator tool）
    console.log(`🧠 正在让 LLM 生成脚本...`);
    const pythonScript = await generatePythonScript(task, dataInput, outputFormat, generatePythonScriptFallback);
    
    if (!pythonScript || pythonScript.trim().length === 0) {
      return `【Python 脚本生成失败】\n\n❌ LLM 未能生成有效脚本，请尝试用更明确的语言描述需求。`;
    }
    
    console.log(`📝 生成脚本:\n${pythonScript.substring(0, 300)}...`);

    // Step 2: 安全检查（使用 tool 中的安全检查）
    const safetyCheck = checkScriptSafety(pythonScript);
    if (!safetyCheck.safe) {
      return `【Python 脚本安全检查未通过】\n\n❌ 检测到危险操作: ${safetyCheck.reason}\n\n🔧 脚本内容:\n\`\`\`python\n${pythonScript}\n\`\``;
    }

    // Step 3: 执行脚本
    const execResult = await execCode(pythonScript, 'python');
    
    if (!execResult.success) {
      return `【Python 执行失败】\n\n❌ 错误信息:\n${execResult.error}\n\n🔧 脚本内容:\n\`\`\`python\n${pythonScript}\n\`\``;
    }

    // Step 4: LLM 分析结果并返回（使用 script_generator tool 的分析功能）
    const resultAnalysis = await analyzeScriptResult(task, pythonScript, execResult.output, outputFormat, analyzeResultFallback);
    
    return `【Python 脚本执行结果】

📋 任务: ${task}
⏱️ 执行时间: ${execResult.executionTime}

📝 执行脚本:
\`\`\`python
${pythonScript}
\`\`\`

📤 原始输出:
\`\`\`
${execResult.output}
\`\`\`

📊 智能分析:
${resultAnalysis}`;

  } catch (error) {
    return `Python 脚本执行器失败: ${error.message}`;
  }
}

// ========== 降级方案：原有关键词匹配模板（LLM 不可用时使用） ==========

function generatePythonScriptFallback(task, dataInput, outputFormat) {
  const taskLower = task.toLowerCase();
  
  // 数据统计分析类
  if (taskLower.includes('统计') || taskLower.includes('平均') || taskLower.includes('最大') || 
      taskLower.includes('最小') || taskLower.includes('中位数') || taskLower.includes('标准差')) {
    return generateStatsScript(task, dataInput);
  }
  
  // 数据转换/清洗类
  if (taskLower.includes('转换') || taskLower.includes('清洗') || taskLower.includes('格式') ||
      taskLower.includes('json') || taskLower.includes('csv')) {
    return generateTransformScript(task, dataInput, outputFormat);
  }
  
  // 文本处理类
  if (taskLower.includes('文本') || taskLower.includes('字符串') || taskLower.includes('提取') ||
      taskLower.includes('正则') || taskLower.includes('匹配')) {
    return generateTextProcessScript(task, dataInput);
  }
  
  // 算法/数学计算类
  if (taskLower.includes('计算') || taskLower.includes('算法') || taskLower.includes('排序') ||
      taskLower.includes('斐波那契') || taskLower.includes('阶乘') || taskLower.includes('质数')) {
    return generateAlgorithmScript(task, dataInput);
  }
  
  // 漏斗转化类
  if (taskLower.includes('漏斗') || taskLower.includes('转化') || taskLower.includes('曝光') || 
      taskLower.includes('点击') || taskLower.includes('注册') || taskLower.includes('付费')) {
    return generateFunnelScript(task, dataInput);
  }
  
  // 通用默认脚本
  return generateDefaultScript(task, dataInput);
}

/**
 * 生成数据统计分析脚本
 */
function generateStatsScript(task, dataInput) {
  let dataArray = '[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]';
  if (dataInput && dataInput.trim()) {
    const numbers = dataInput.match(/-?\d+(\.\d+)?/g);
    if (numbers) {
      dataArray = '[' + numbers.join(', ') + ']';
    }
  }
  
  return `
import statistics
import json

try:
    data = ${dataArray}
    
    print("=== 数据统计分析报告 ===")
    print(f"数据样本: {data}")
    print(f"样本数量: {len(data)}")
    print(f"平均值: {statistics.mean(data):.4f}")
    print(f"中位数: {statistics.median(data):.4f}")
    try:
        print(f"标准差: {statistics.stdev(data):.4f}")
    except:
        print(f"标准差: N/A (需要至少2个数据点)")
    print(f"最小值: {min(data)}")
    print(f"最大值: {max(data)}")
    
    # JSON 结果
    result = {
        "count": len(data),
        "mean": round(statistics.mean(data), 4),
        "median": round(statistics.median(data), 4),
        "min": min(data),
        "max": max(data)
    }
    print(f"\\nJSON结果: {json.dumps(result, ensure_ascii=False)}")
    print("\\n✅ 统计完成")
except Exception as e:
    print(f"❌ 错误: {e}")
`;
}

/**
 * 生成漏斗转化分析脚本
 */
function generateFunnelScript(task, dataInput) {
  // 尝试从 dataInput 解析漏斗数据
  let funnelData = { exposure: 120000, click: 8400, signup: 2100, pay: 315 };
  
  if (dataInput && dataInput.trim()) {
    // 尝试匹配 exposure=120000, click=8400 格式
    const matches = dataInput.match(/(\w+)\s*=\s*(\d+)/g);
    if (matches) {
      matches.forEach(m => {
        const [k, v] = m.split('=');
        const key = k.trim().toLowerCase();
        const val = parseInt(v.trim());
        if (['exposure', 'click', 'signup', 'pay', 'visit', 'download', 'install'].includes(key)) {
          funnelData[key] = val;
        }
      });
    }
  }
  
  return `
import json

try:
    # 漏斗数据
    funnel = ${JSON.stringify(funnelData)}
    
    print("=== 漏斗转化分析 ===")
    print(f"漏斗数据: {funnel}")
    
    # 计算转化率
    keys = list(funnel.keys())
    values = list(funnel.values())
    
    print(f"\\n📊 各阶段转化率:")
    for i in range(len(keys)-1):
        from_key, from_val = keys[i], values[i]
        to_key, to_val = keys[i+1], values[i+1]
        rate = (to_val / from_val * 100) if from_val > 0 else 0
        print(f"  {from_key} → {to_key}: {rate:.2f}% ({to_val}/{from_val})")
    
    # 整体转化率
    if len(values) >= 2:
        overall = (values[-1] / values[0] * 100) if values[0] > 0 else 0
        print(f"\\n📈 整体转化率: {overall:.2f}% (从 {keys[0]} 到 {keys[-1]})")
    
    # 输出结构化结果
    result = {
        "funnel": funnel,
        "overall_rate": round(overall if len(values) >= 2 else 0, 2)
    }
    print(f"\\nJSON结果: {json.dumps(result, ensure_ascii=False)}")
    print("\\n✅ 漏斗分析完成")
except Exception as e:
    print(f"❌ 错误: {e}")
`;
}

/**
 * 生成数据转换脚本
 */
function generateTransformScript(task, dataInput, outputFormat) {
  const inputData = dataInput || '{"name": "张三", "age": 25}';
  
  return `
import json
import csv
from io import StringIO

try:
    print("=== 数据转换处理 ===")
    
    input_str = """${inputData}"""
    
    # 尝试解析 JSON
    try:
        data = json.loads(input_str)
        print(f"输入数据已解析为 JSON")
        
        # 转换为 CSV
        if isinstance(data, dict):
            output = StringIO()
            writer = csv.writer(output)
            writer.writerow(data.keys())
            writer.writerow(data.values())
            print(f"\\nCSV输出:")
            print(output.getvalue())
        elif isinstance(data, list) and len(data) > 0:
            output = StringIO()
            writer = csv.DictWriter(output, fieldnames=data[0].keys())
            writer.writeheader()
            writer.writerows(data)
            print(f"\\nCSV输出:")
            print(output.getvalue())
    except json.JSONDecodeError:
        print(f"输入不是标准 JSON，原样输出:")
        print(input_str)
    
    print(f"\\n✅ 转换完成")
except Exception as e:
    print(f"❌ 错误: {e}")
`;
}

/**
 * 生成文本处理脚本
 */
function generateTextProcessScript(task, dataInput) {
  const text = dataInput || '示例文本：张三 13800138000 zhangsan@corp.com';
  
  return `
import re

try:
    text = """${text}"""
    
    print("=== 文本处理分析 ===")
    print(f"原始文本长度: {len(text)} 字符")
    
    # 提取邮箱
    emails = re.findall(r'[A-Za-z0-9_.+\\-]+@[A-Za-z0-9\\-]+(?:\\.[A-Za-z0-9\\-]+)+', text)
    if emails:
        emails = sorted(set(emails))
        print(f"提取的邮箱: {emails}")
    
    # 提取手机号
    phones = re.findall(r'1[3-9]\\d{9}', text)
    if phones:
        phones = sorted(set(phones))
        print(f"提取的手机号: {phones}")
    
    # 提取 URL
    urls = re.findall(r'https?://[^\\s<>\"{}|\\\\^\\[\\]]+', text)
    if urls:
        urls = sorted(set(urls))
        print(f"提取的 URL: {urls}")
    
    # 统计
    print(f"\\n📊 统计:")
    print(f"  邮箱数: {len(emails)}")
    print(f"  手机号数: {len(phones)}")
    print(f"  URL数: {len(urls)}")
    
    print(f"\\n✅ 文本处理完成")
except Exception as e:
    print(f"❌ 错误: {e}")
`;
}

/**
 * 生成算法计算脚本
 */
function generateAlgorithmScript(task, dataInput) {
  return `
import math

try:
    print("=== 算法计算结果 ===")
    
    # 斐波那契
    def fibonacci(n):
        if n <= 1: return n
        return fibonacci(n-1) + fibonacci(n-2)
    
    # 阶乘
    def factorial(n):
        if n <= 1: return 1
        return n * factorial(n-1)
    
    # 质数判断
    def is_prime(n):
        if n < 2: return False
        for i in range(2, int(math.sqrt(n)) + 1):
            if n % i == 0: return False
        return True
    
    # 执行示例计算
    print("斐波那契数列 (前10项):")
    fibs = [fibonacci(i) for i in range(10)]
    print(fibs)
    
    print(f"\\n5的阶乘: {factorial(5)}")
    
    print(f"\\n1-50之间的质数:")
    primes = [n for n in range(1, 51) if is_prime(n)]
    print(f"{primes} (共 {len(primes)} 个)")
    
    print(f"\\n✅ 算法执行完成")
except Exception as e:
    print(f"❌ 错误: {e}")
`;
}

/**
 * 生成默认脚本
 */
function generateDefaultScript(task, dataInput) {
  return `
print("=== 任务执行结果 ===")
print(f"任务描述: ${task}")

try:
    data = """${dataInput}"""
    if data.strip():
        print(f"收到数据长度: {len(data)} 字符")
        print(f"数据预览: {data[:200]}...")
        print(f"行数: {len(data.split(chr(10)))}")
    else:
        print("无输入数据")
    
    print(f"\\n✅ 任务执行完成")
except Exception as e:
    print(f"❌ 错误: {e}")
`;
}

/**
 * 降级方案：基础结果分析（LLM 不可用时使用）
 */
function analyzeResultFallback(task, output, outputFormat) {
  const outputLower = output.toLowerCase();
  
  // 提取 JSON 结果
  let jsonData = null;
  const jsonMatch = output.match(/JSON结果:\s*(\{.*?\})/);
  if (jsonMatch) {
    try {
      jsonData = JSON.parse(jsonMatch[1]);
    } catch (e) {
      // ignore
    }
  }
  
  let analysis = [];
  
  if (jsonData) {
    analysis.push(`✅ 成功提取结构化数据`);
    analysis.push(`📊 关键指标: ${Object.entries(jsonData).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  }
  
  if (outputLower.includes('平均值') || outputLower.includes('mean')) {
    analysis.push(`📈 包含统计计算结果`);
  }
  
  if (outputLower.includes('错误') || outputLower.includes('error') || outputLower.includes('fail')) {
    analysis.push(`⚠️ 检测到可能的错误或异常`);
  } else {
    analysis.push(`✅ 脚本执行成功，无错误`);
  }
  
  return analysis.join('\n') + `\n\n💡 提示: 结果已输出，可根据业务需求进一步解读`;
}
