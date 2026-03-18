// ========== 代码执行工具（沙箱环境） ==========

import { exec } from 'child_process';
import { promisify } from 'util';
import vm from 'vm';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

const execAsync = promisify(exec);

// 执行超时配置（毫秒）
const EXEC_TIMEOUT = 30000; // 30秒

/**
 * 执行代码片段（支持 JavaScript/TypeScript/Python）
 * @param {string} code - 代码内容
 * @param {string} language - 编程语言 (javascript, typescript, python)
 * @param {Object} options - 可选配置
 * @returns {Promise<Object>} - 执行结果 { success, output, error, executionTime }
 */
export async function execCode(code, language = 'javascript', options = {}) {
  console.log(`\n  🔧 [工具调用] 执行代码 (${language})`);
  
  const startTime = Date.now();
  
  try {
    let result;
    
    switch (language.toLowerCase()) {
      case 'javascript':
      case 'js':
        result = await execJavaScript(code, options);
        break;
      case 'typescript':
      case 'ts':
        result = await execTypeScript(code, options);
        break;
      case 'python':
      case 'py':
        result = await execPython(code, options);
        break;
      default:
        throw new Error(`不支持的语言: ${language}。目前支持: javascript, typescript, python`);
    }
    
    const executionTime = Date.now() - startTime;
    
    return {
      success: result.success,
      output: result.output,
      error: result.error,
      executionTime: `${executionTime}ms`,
      language: language.toLowerCase()
    };
    
  } catch (error) {
    return {
      success: false,
      output: '',
      error: error.message,
      executionTime: `${Date.now() - startTime}ms`,
      language: language.toLowerCase()
    };
  }
}

/**
 * 在沙箱中执行 JavaScript 代码
 */
async function execJavaScript(code, options = {}) {
  // 创建安全的沙箱上下文
  const sandbox = {
    console: {
      log: (...args) => { output.push(args.map(a => String(a)).join(' ')); },
      error: (...args) => { output.push('[ERROR] ' + args.map(a => String(a)).join(' ')); },
      warn: (...args) => { output.push('[WARN] ' + args.map(a => String(a)).join(' ')); },
    },
    Math,
    Date,
    JSON,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    Promise,
    setTimeout: () => { throw new Error('setTimeout 在沙箱中不可用'); },
    setInterval: () => { throw new Error('setInterval 在沙箱中不可用'); },
    require: () => { throw new Error('require 在沙箱中不可用，请使用内置对象'); },
  };
  
  const output = [];
  const context = vm.createContext(sandbox);
  
  try {
    // 包装代码以捕获返回值
    const wrappedCode = `
      (async function() {
        try {
          ${code}
        } catch (e) {
          console.error(e.message);
        }
      })()
    `;
    
    const script = new vm.Script(wrappedCode, { timeout: EXEC_TIMEOUT });
    await script.runInContext(context, { timeout: EXEC_TIMEOUT });
    
    return {
      success: true,
      output: output.join('\n') || '(无输出)',
      error: null
    };
  } catch (error) {
    return {
      success: false,
      output: output.join('\n'),
      error: error.message
    };
  }
}

/**
 * 执行 TypeScript 代码（先转译再执行）
 */
async function execTypeScript(code, options = {}) {
  // 简化实现：将 TS 当 JS 执行（去掉类型注解）
  // 实际生产环境可以使用 ts-node 或 esbuild 转译
  const strippedCode = code
    .replace(/:\s*[A-Za-z<>,\[\]|&\s]+/g, '')  // 简单移除类型注解
    .replace(/interface\s+\w+\s*\{[^}]*\}/g, '') // 移除 interface
    .replace(/type\s+\w+\s*=\s*[^;]+;/g, '');   // 移除 type alias
  
  return execJavaScript(strippedCode, options);
}

/**
 * 检查 Python 环境是否可用
 */
async function checkPythonEnvironment() {
  try {
    await execAsync('python3 --version', { timeout: 5000 });
    return { available: true, message: null };
  } catch (err) {
    return {
      available: false,
      message: 'Python 3 环境未检测到。请安装 Python 3.7+ 以使用 Python 脚本执行功能。安装指南: https://www.python.org/downloads/'
    };
  }
}

/**
 * 执行 Python 代码
 */
async function execPython(code, options = {}) {
  // 首先检查 Python 环境
  const envCheck = await checkPythonEnvironment();
  if (!envCheck.available) {
    return {
      success: false,
      output: '',
      error: envCheck.message
    };
  }
  
  // 创建临时文件
  const tempDir = os.tmpdir();
  const tempFile = path.join(tempDir, `exec_${Date.now()}_${Math.random().toString(36).slice(2)}.py`);
  
  try {
    // 写入临时文件
    await fs.writeFile(tempFile, code, 'utf-8');
    
    // 使用 Node.js exec 的 timeout 参数限制执行时间（避免依赖 macOS 上不存在的 `timeout` 命令）
    try {
      const { stdout, stderr } = await execAsync(
        `python3 "${tempFile}"`,
        { timeout: EXEC_TIMEOUT, maxBuffer: 10 * 1024 * 1024 }
      );
      
      // 清理临时文件
      await fs.unlink(tempFile).catch(() => {});
      
      const hasErrorText = stderr && stderr.trim();
      return {
        success: !hasErrorText,
        output: (stdout || '').trim() || '(无输出)',
        error: hasErrorText || null
      };
    } catch (err) {
      // 清理临时文件
      await fs.unlink(tempFile).catch(() => {});
      
      const isTimeout = err && (err.killed || err.signal === 'SIGTERM') && String(err.message || '').toLowerCase().includes('timed out');
      
      if (isTimeout) {
        return {
          success: false,
          output: (err.stdout || '').trim() || '',
          error: `执行超时（${EXEC_TIMEOUT / 1000}s限制）`
        };
      }
      
      const stderrText = (err.stderr || '').trim();
      const stdoutText = (err.stdout || '').trim();
      return {
        success: false,
        output: stdoutText || '',
        error: stderrText || err.message || '执行失败'
      };
    }
    
  } catch (error) {
    // 清理临时文件
    await fs.unlink(tempFile).catch(() => {});
    
    return {
      success: false,
      output: '',
      error: error.message || '执行失败'
    };
  }
}

/**
 * 安全校验：检查危险代码
 */
function isDangerousCode(code, language) {
  const dangerousPatterns = [
    /rm\s+-rf/i,
    /System\.exit/i,
    /process\.exit/i,
    /child_process/i,
    /fs\.unlink/i,
    /while\s*\(\s*true\s*\)/i,
    /for\s*\(\s*;\s*;\s*\)/i,
  ];
  
  return dangerousPatterns.some(pattern => pattern.test(code));
}
