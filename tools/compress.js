import archiver from 'archiver';
import unzipper from 'unzipper';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPublicUrl } from './fileManager.js';
import { CONFIG } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 压缩文件或目录
 * @param {string} sessionId - 用户会话ID
 * @param {string|string[]} sourcePaths - 要压缩的文件或目录路径（支持单文件/目录或数组）
 * @param {string} outputPath - 输出zip文件路径
 * @param {Object} options - 选项
 * @returns {Promise<Object>} 压缩结果
 */
export async function compressFiles(sessionId, sourcePaths, outputPath, options = {}) {
  try {
    const { overwrite = false, compressionLevel = 5 } = options;
    
    // 解析 workspace 根路径
    const rootPath = process.env.WORKSPACE_ROOT || path.resolve(__dirname, '../public/workspace');
    const workspacePath = path.join(rootPath, sessionId);
    
    // 确保 workspace 存在
    if (!fs.existsSync(workspacePath)) {
      fs.mkdirSync(workspacePath, { recursive: true });
    }
    
    // 构建完整输出路径
    const fullOutputPath = path.resolve(workspacePath, outputPath);
    
    // 检查是否覆盖
    if (fs.existsSync(fullOutputPath) && !overwrite) {
      return {
        success: false,
        error: `文件 ${outputPath} 已存在，请设置 overwrite 为 true 覆盖`
      };
    }
    
    // 创建输出目录
    fs.mkdirSync(path.dirname(fullOutputPath), { recursive: true });
    
    // 标准化 sourcePaths 为数组
    const sources = Array.isArray(sourcePaths) ? sourcePaths : [sourcePaths];
    
    // 创建压缩流
    const output = fs.createWriteStream(fullOutputPath);
    const archive = archiver('zip', {
      zlib: { level: compressionLevel } // 压缩级别 0-9
    });
    
    // 监听错误
    archive.on('error', (err) => {
      throw err;
    });
    
    // 管道连接
    archive.pipe(output);
    
    // 添加文件/目录到压缩包
    for (const source of sources) {
      const fullSourcePath = path.resolve(workspacePath, source);
      
      // 安全检查：确保在 workspace 内
      if (!fullSourcePath.startsWith(workspacePath)) {
        return {
          success: false,
          error: `路径 ${source} 超出 workspace 范围`
        };
      }
      
      if (!fs.existsSync(fullSourcePath)) {
        return {
          success: false,
          error: `源文件/目录不存在: ${source}`
        };
      }
      
      const stats = fs.statSync(fullSourcePath);
      const baseName = path.basename(source);
      
      if (stats.isDirectory()) {
        // 添加目录
        archive.directory(fullSourcePath, baseName);
      } else {
        // 添加文件
        archive.file(fullSourcePath, { name: baseName });
      }
    }
    
    // 完成压缩
    await archive.finalize();
    
    // 等待流完成
    await new Promise((resolve, reject) => {
      output.on('close', resolve);
      output.on('error', reject);
    });
    
    // 获取文件信息
    const stats = fs.statSync(fullOutputPath);
    
    return {
      success: true,
      outputPath,
      fullPath: fullOutputPath,
      url: getPublicUrl(fullOutputPath, sessionId),
      fullUrl: `${CONFIG.baseUrl}${getPublicUrl(fullOutputPath, sessionId)}`,
      size: stats.size,
      sizeFormatted: formatFileSize(stats.size),
      compressedCount: sources.length
    };
  } catch (error) {
    return {
      success: false,
      error: `压缩失败: ${error.message}`
    };
  }
}

/**
 * 解压 zip 文件
 * @param {string} sessionId - 用户会话ID
 * @param {string} zipPath - zip 文件路径
 * @param {string} extractPath - 解压目标目录（可选，默认为 zip 文件名目录）
 * @param {Object} options - 选项
 * @returns {Promise<Object>} 解压结果
 */
export async function extractArchive(sessionId, zipPath, extractPath, options = {}) {
  try {
    const { overwrite = true } = options;
    
    // 解析 workspace 根路径
    const rootPath = process.env.WORKSPACE_ROOT || path.resolve(__dirname, '../public/workspace');
    const workspacePath = path.join(rootPath, sessionId);
    
    // 构建完整路径
    const fullZipPath = path.resolve(workspacePath, zipPath);
    
    // 安全检查：确保在 workspace 内
    if (!fullZipPath.startsWith(workspacePath)) {
      return {
        success: false,
        error: `路径 ${zipPath} 超出 workspace 范围`
      };
    }
    
    // 检查 zip 文件是否存在
    if (!fs.existsSync(fullZipPath)) {
      return {
        success: false,
        error: `压缩包不存在: ${zipPath}`
      };
    }
    
    // 确定解压目录
    let fullExtractPath;
    if (extractPath) {
      fullExtractPath = path.resolve(workspacePath, extractPath);
    } else {
      // 默认使用 zip 文件名（去掉扩展名）
      const zipName = path.basename(zipPath, '.zip');
      fullExtractPath = path.join(workspacePath, zipName);
    }
    
    // 安全检查：确保解压目录在 workspace 内
    if (!fullExtractPath.startsWith(workspacePath)) {
      return {
        success: false,
        error: `解压路径超出 workspace 范围`
      };
    }
    
    // 创建解压目录
    fs.mkdirSync(fullExtractPath, { recursive: true });
    
    // 解压
    const extractedFiles = [];
    
    await new Promise((resolve, reject) => {
      fs.createReadStream(fullZipPath)
        .pipe(unzipper.Parse())
        .on('entry', (entry) => {
          const fileName = entry.path;
          const type = entry.type; // 'Directory' or 'File'
          
          // 安全检查：防止路径穿越攻击
          const fullEntryPath = path.resolve(fullExtractPath, fileName);
          if (!fullEntryPath.startsWith(fullExtractPath)) {
            entry.autodrain();
            return;
          }
          
          if (type === 'Directory') {
            fs.mkdirSync(fullEntryPath, { recursive: true });
            entry.autodrain();
          } else {
            // 创建目录
            fs.mkdirSync(path.dirname(fullEntryPath), { recursive: true });
            
            // 写入文件
            entry.pipe(fs.createWriteStream(fullEntryPath))
              .on('finish', () => {
                extractedFiles.push(fileName);
              });
          }
        })
        .on('close', resolve)
        .on('error', reject);
    });
    
    return {
      success: true,
      zipPath,
      extractPath: extractPath || path.basename(zipPath, '.zip'),
      fullExtractPath,
      extractedCount: extractedFiles.length,
      extractedFiles: extractedFiles.slice(0, 50) // 最多返回50个文件
    };
  } catch (error) {
    return {
      success: false,
      error: `解压失败: ${error.message}`
    };
  }
}

/**
 * 获取压缩包信息
 * @param {string} sessionId - 用户会话ID
 * @param {string} zipPath - zip 文件路径
 * @returns {Promise<Object>} 压缩包信息
 */
export async function getArchiveInfo(sessionId, zipPath) {
  try {
    // 解析 workspace 根路径
    const rootPath = process.env.WORKSPACE_ROOT || path.resolve(__dirname, '../public/workspace');
    const workspacePath = path.join(rootPath, sessionId);
    
    // 构建完整路径
    const fullZipPath = path.resolve(workspacePath, zipPath);
    
    // 安全检查：确保在 workspace 内
    if (!fullZipPath.startsWith(workspacePath)) {
      return {
        success: false,
        error: `路径 ${zipPath} 超出 workspace 范围`
      };
    }
    
    // 检查 zip 文件是否存在
    if (!fs.existsSync(fullZipPath)) {
      return {
        success: false,
        error: `压缩包不存在: ${zipPath}`
      };
    }
    
    // 获取基本信息
    const stats = fs.statSync(fullZipPath);
    const files = [];
    let totalUncompressedSize = 0;
    let directoryCount = 0;
    let fileCount = 0;
    
    // 读取 zip 内容
    await new Promise((resolve, reject) => {
      fs.createReadStream(fullZipPath)
        .pipe(unzipper.Parse())
        .on('entry', (entry) => {
          const fileName = entry.path;
          const type = entry.type;
          const vars = entry.vars;
          
          // 获取未压缩大小
          const uncompressedSize = vars.uncompressedSize || 0;
          totalUncompressedSize += uncompressedSize;
          
          if (type === 'Directory') {
            directoryCount++;
          } else {
            fileCount++;
            files.push({
              name: fileName,
              type: type,
              size: uncompressedSize,
              sizeFormatted: formatFileSize(uncompressedSize),
              compressedSize: vars.compressedSize || 0,
              modifiedTime: vars.lastModifiedTime || null
            });
          }
          
          entry.autodrain();
        })
        .on('close', resolve)
        .on('error', reject);
    });
    
    const compressionRatio = totalUncompressedSize > 0 
      ? ((1 - stats.size / totalUncompressedSize) * 100).toFixed(2) + '%'
      : '0%';
    
    return {
      success: true,
      path: zipPath,
      url: getPublicUrl(fullZipPath, sessionId),
      fullUrl: `${CONFIG.baseUrl}${getPublicUrl(fullZipPath, sessionId)}`,
      size: stats.size,
      sizeFormatted: formatFileSize(stats.size),
      totalUncompressedSize,
      totalUncompressedFormatted: formatFileSize(totalUncompressedSize),
      compressionRatio,
      fileCount,
      directoryCount,
      totalEntries: fileCount + directoryCount,
      files: files.slice(0, 100) // 最多返回100个文件详情
    };
  } catch (error) {
    return {
      success: false,
      error: `获取压缩包信息失败: ${error.message}`
    };
  }
}

/**
 * 列出压缩包内容（不解压）
 * @param {string} sessionId - 用户会话ID
 * @param {string} zipPath - zip 文件路径
 * @param {Object} options - 选项
 * @returns {Promise<Object>} 文件列表
 */
export async function listArchiveContents(sessionId, zipPath, options = {}) {
  try {
    const { maxFiles = 200 } = options;
    
    // 解析 workspace 根路径
    const rootPath = process.env.WORKSPACE_ROOT || path.resolve(__dirname, '../public/workspace');
    const workspacePath = path.join(rootPath, sessionId);
    
    // 构建完整路径
    const fullZipPath = path.resolve(workspacePath, zipPath);
    
    // 安全检查
    if (!fullZipPath.startsWith(workspacePath)) {
      return {
        success: false,
        error: `路径 ${zipPath} 超出 workspace 范围`
      };
    }
    
    if (!fs.existsSync(fullZipPath)) {
      return {
        success: false,
        error: `压缩包不存在: ${zipPath}`
      };
    }
    
    const files = [];
    let fileCount = 0;
    let directoryCount = 0;
    
    await new Promise((resolve, reject) => {
      fs.createReadStream(fullZipPath)
        .pipe(unzipper.Parse())
        .on('entry', (entry) => {
          if (files.length < maxFiles) {
            files.push({
              name: entry.path,
              type: entry.type,
              size: entry.vars.uncompressedSize || 0
            });
          }
          
          if (entry.type === 'Directory') {
            directoryCount++;
          } else {
            fileCount++;
          }
          
          entry.autodrain();
        })
        .on('close', resolve)
        .on('error', reject);
    });
    
    return {
      success: true,
      zipPath,
      files,
      fileCount,
      directoryCount,
      totalEntries: fileCount + directoryCount,
      truncated: (fileCount + directoryCount) > maxFiles
    };
  } catch (error) {
    return {
      success: false,
      error: `列出压缩包内容失败: ${error.message}`
    };
  }
}

// 辅助函数：格式化文件大小
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
