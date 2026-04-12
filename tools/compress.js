import archiver from 'archiver';
import unzipper from 'unzipper';
import fs from 'fs';
import path from 'path';
import { getPublicUrlInfo, resolveWorkspacePath } from './fileManager.js';

// 默认压缩等级：1 表示更偏向降低 CPU 消耗，适合轻量服务器；值越高压缩更充分，但更耗时耗 CPU
const DEFAULT_COMPRESSION_LEVEL = Number(process.env.ZIP_COMPRESSION_LEVEL || 1);
// 单次压缩允许处理的最大输入体积（所有源文件总和），默认 10MB，避免大目录把机器拖慢
const MAX_COMPRESS_INPUT_BYTES = Number(process.env.ZIP_MAX_INPUT_BYTES || 10 * 1024 * 1024);
// 单次压缩允许处理的最大文件数量，默认 50 个，防止海量小文件遍历过久
const MAX_COMPRESS_FILE_COUNT = Number(process.env.ZIP_MAX_FILE_COUNT || 50);
// 单次压缩允许执行的最长时间，默认 30 秒；超时会主动中断，避免请求一直卡住
const MAX_COMPRESS_DURATION_MS = Number(process.env.ZIP_MAX_DURATION_MS || 30 * 1000);
// 同一进程内允许同时进行的压缩任务数量，默认 1，避免轻量服务器被多个压缩任务同时打满
const MAX_CONCURRENT_COMPRESSIONS = Number(process.env.ZIP_MAX_CONCURRENT_COMPRESSIONS || 1);
// 当前进程内正在执行的压缩任务数；用于做简单并发限流（注意：仅在单进程内生效）
let activeCompressionJobs = 0;

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}

function collectCompressionStats(targetPath) {
  const stats = fs.statSync(targetPath);

  if (!stats.isDirectory()) {
    return {
      fileCount: 1,
      totalBytes: stats.size,
    };
  }

  let fileCount = 0;
  let totalBytes = 0;
  const queue = [targetPath];

  while (queue.length > 0) {
    const currentPath = queue.pop();
    const items = fs.readdirSync(currentPath, { withFileTypes: true });

    for (const item of items) {
      const itemPath = path.join(currentPath, item.name);
      if (item.isDirectory()) {
        queue.push(itemPath);
        continue;
      }
      const itemStats = fs.statSync(itemPath);
      fileCount += 1;
      totalBytes += itemStats.size;
    }
  }

  return { fileCount, totalBytes };
}

/**
 * 压缩文件或目录
 * @param {string} sessionId - 用户会话ID
 * @param {string|string[]} sourcePaths - 要压缩的文件或目录路径（支持单文件/目录或数组）
 * @param {string} outputPath - 输出zip文件路径
 * @param {Object} options - 选项
 * @returns {Promise<Object>} 压缩结果
 */
export async function compressFiles(sessionId, sourcePaths, outputPath, options = {}) {
  let fullOutputPath = null;
  let hasCompressionSlot = false;
  let effectiveLimits = {
    maxInputBytes: MAX_COMPRESS_INPUT_BYTES,
    maxInputBytesFormatted: formatFileSize(MAX_COMPRESS_INPUT_BYTES),
    maxFileCount: MAX_COMPRESS_FILE_COUNT,
    timeoutMs: MAX_COMPRESS_DURATION_MS,
    maxConcurrentCompressions: MAX_CONCURRENT_COMPRESSIONS,
  };

  try {
    const {
      overwrite = false,
      compressionLevel = DEFAULT_COMPRESSION_LEVEL,
      maxInputBytes = MAX_COMPRESS_INPUT_BYTES,
      maxFileCount = MAX_COMPRESS_FILE_COUNT,
      timeoutMs = MAX_COMPRESS_DURATION_MS,
    } = options;

    fullOutputPath = resolveWorkspacePath(outputPath, sessionId);

    if (activeCompressionJobs >= MAX_CONCURRENT_COMPRESSIONS) {
      return {
        success: false,
        error: `当前压缩任务较多，请稍后重试（并发上限: ${MAX_CONCURRENT_COMPRESSIONS}）`,
        errorCode: 'ZIP_TOO_MANY_CONCURRENT_JOBS',
        limits: {
          maxConcurrentCompressions: MAX_CONCURRENT_COMPRESSIONS,
          maxInputBytes,
          maxInputBytesFormatted: formatFileSize(maxInputBytes),
          maxFileCount,
          timeoutMs: Number(timeoutMs) || MAX_COMPRESS_DURATION_MS,
        },
      };
    }

    activeCompressionJobs += 1;
    hasCompressionSlot = true;
    
    // 检查是否覆盖
    if (fs.existsSync(fullOutputPath) && !overwrite) {
      return {
        success: false,
        error: `文件 ${outputPath} 已存在，请设置 overwrite 为 true 覆盖`
      };
    }
    
    // 创建输出目录
    fs.mkdirSync(path.dirname(fullOutputPath), { recursive: true });
    
    // 如果目标 zip 正好在源目录内，预检查统计时忽略它，避免把旧 zip 算进输入规模
    if (fs.existsSync(fullOutputPath)) {
      try {
        fs.unlinkSync(fullOutputPath);
      } catch (error) {
        return {
          success: false,
          error: `无法覆盖已有压缩文件: ${error.message}`
        };
      }
    }
    
    // 标准化 sourcePaths 为数组
    const sources = Array.isArray(sourcePaths) ? sourcePaths : [sourcePaths];
    const normalizedCompressionLevel = Math.max(0, Math.min(9, Number(compressionLevel) || DEFAULT_COMPRESSION_LEVEL));
    const normalizedTimeoutMs = Math.max(1000, Number(timeoutMs) || MAX_COMPRESS_DURATION_MS);
    effectiveLimits = {
      maxInputBytes,
      maxInputBytesFormatted: formatFileSize(maxInputBytes),
      maxFileCount,
      timeoutMs: normalizedTimeoutMs,
      maxConcurrentCompressions: MAX_CONCURRENT_COMPRESSIONS,
    };

    let totalInputBytes = 0;
    let totalFileCount = 0;
    const resolvedSources = [];

    for (const source of sources) {
      let fullSourcePath;
      try {
        fullSourcePath = resolveWorkspacePath(source, sessionId);
      } catch (e) {
        return {
          success: false,
          error: e.message || `路径 ${source} 超出 workspace 范围`
        };
      }
      
      if (!fs.existsSync(fullSourcePath)) {
        return {
          success: false,
          error: `源文件/目录不存在: ${source}`
        };
      }

      const sourceStats = collectCompressionStats(fullSourcePath);
      totalInputBytes += sourceStats.totalBytes;
      totalFileCount += sourceStats.fileCount;

      if (totalInputBytes > maxInputBytes) {
        return {
          success: false,
          error: `待压缩内容过大：${formatFileSize(totalInputBytes)}，超过限制 ${formatFileSize(maxInputBytes)}`,
          errorCode: 'ZIP_INPUT_TOO_LARGE',
          limits: {
            maxInputBytes,
            maxInputBytesFormatted: formatFileSize(maxInputBytes),
            maxFileCount,
            timeoutMs: normalizedTimeoutMs,
            maxConcurrentCompressions: MAX_CONCURRENT_COMPRESSIONS,
          },
          actual: {
            inputBytes: totalInputBytes,
            inputBytesFormatted: formatFileSize(totalInputBytes),
            inputFileCount: totalFileCount,
          }
        };
      }

      if (totalFileCount > maxFileCount) {
        return {
          success: false,
          error: `待压缩文件数量过多：${totalFileCount}，超过限制 ${maxFileCount}`,
          errorCode: 'ZIP_TOO_MANY_FILES',
          limits: {
            maxInputBytes,
            maxInputBytesFormatted: formatFileSize(maxInputBytes),
            maxFileCount,
            timeoutMs: normalizedTimeoutMs,
            maxConcurrentCompressions: MAX_CONCURRENT_COMPRESSIONS,
          },
          actual: {
            inputBytes: totalInputBytes,
            inputBytesFormatted: formatFileSize(totalInputBytes),
            inputFileCount: totalFileCount,
          }
        };
      }

      resolvedSources.push({
        source,
        fullSourcePath,
      });
    }
    
    // 创建压缩流
    const output = fs.createWriteStream(fullOutputPath);
    const archive = archiver('zip', {
      zlib: { level: normalizedCompressionLevel }
    });
    let timeoutHandle = null;
    
    // 监听错误
    archive.on('error', (err) => {
      throw err;
    });
    
    // 管道连接
    archive.pipe(output);
    
    // 添加文件/目录到压缩包
    for (const { source, fullSourcePath } of resolvedSources) {
      const stats = fs.statSync(fullSourcePath);
      const baseName = path.basename(source);
      
      if (stats.isDirectory()) {
        // 添加目录（若输出文件在源目录内，排除自身避免循环引用）
        const globOptions = {};
        if (fullOutputPath.startsWith(fullSourcePath + path.sep)) {
          const relIgnore = path.relative(fullSourcePath, fullOutputPath);
          globOptions.ignore = [relIgnore];
        }
        archive.glob('**/*', { cwd: fullSourcePath, dot: true, ...globOptions }, { prefix: baseName });
      } else {
        // 添加文件
        archive.file(fullSourcePath, { name: baseName });
      }
    }
    
    // 完成压缩
    const compressionPromise = new Promise((resolve, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new Error(`ZIP_TIMEOUT::压缩超时：超过 ${Math.ceil(normalizedTimeoutMs / 1000)} 秒，可能是文件过多或体积过大`));
        archive.abort();
        output.destroy();
      }, normalizedTimeoutMs);

      output.on('close', resolve);
      output.on('error', reject);
      archive.finalize().catch(reject);
    });

    await compressionPromise;

    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
    
    // 获取文件信息
    const stats = fs.statSync(fullOutputPath);
    const urlInfo = getPublicUrlInfo(fullOutputPath, sessionId);
    
    return {
      success: true,
      outputPath,
      fullPath: fullOutputPath,
      url: urlInfo?.fullUrl || null,
      fullUrl: urlInfo?.fullUrl || null,
      signedPath: urlInfo?.path || null,
      size: stats.size,
      sizeFormatted: formatFileSize(stats.size),
      inputBytes: totalInputBytes,
      inputBytesFormatted: formatFileSize(totalInputBytes),
      inputFileCount: totalFileCount,
      compressionLevel: normalizedCompressionLevel,
      timeoutMs: normalizedTimeoutMs,
      compressedCount: sources.length
    };
  } catch (error) {
    if (fullOutputPath && fs.existsSync(fullOutputPath)) {
      try {
        fs.unlinkSync(fullOutputPath);
      } catch {
        // ignore cleanup errors, keep original compression error
      }
    }

    const rawMessage = error?.message || '未知错误';
    const isTimeout = rawMessage.startsWith('ZIP_TIMEOUT::');
    const message = isTimeout ? rawMessage.replace('ZIP_TIMEOUT::', '') : rawMessage;

    return {
      success: false,
      error: `压缩失败: ${message}`,
      errorCode: isTimeout ? 'ZIP_TIMEOUT' : 'ZIP_FAILED',
      limits: effectiveLimits
    };
  } finally {
    if (hasCompressionSlot && activeCompressionJobs > 0) {
      activeCompressionJobs -= 1;
    }
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
    const { overwrite = false } = options;

    let fullZipPath;
    try {
      fullZipPath = resolveWorkspacePath(zipPath, sessionId);
    } catch (e) {
      return {
        success: false,
        error: e.message || `路径 ${zipPath} 超出 workspace 范围`
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
    try {
      if (extractPath) {
        fullExtractPath = resolveWorkspacePath(extractPath, sessionId);
      } else {
        const zipName = path.basename(zipPath, '.zip');
        fullExtractPath = resolveWorkspacePath(zipName, sessionId);
      }
    } catch (e) {
      return {
        success: false,
        error: e.message || `解压路径超出 workspace 范围`
      };
    }
    
    // 创建解压目录
    fs.mkdirSync(fullExtractPath, { recursive: true });
    
    // 解压
    const extractedFiles = [];
    const skippedFiles = [];
    let hasConflict = false;
    
    await new Promise((resolve, reject) => {
      const parser = unzipper.Parse();

      fs.createReadStream(fullZipPath)
        .pipe(parser)
        .on('entry', (entry) => {
          const fileName = entry.path;
          const type = entry.type; // 'Directory' or 'File'
          
          // 安全检查：防止路径穿越攻击
          const fullEntryPath = path.resolve(fullExtractPath, fileName);
          if (!fullEntryPath.startsWith(fullExtractPath)) {
            entry.autodrain();
            return;
          }

          if (hasConflict) {
            entry.autodrain();
            return;
          }
          
          if (type === 'Directory') {
            fs.mkdirSync(fullEntryPath, { recursive: true });
            entry.autodrain();
            return;
          }

          if (!overwrite && fs.existsSync(fullEntryPath)) {
            hasConflict = true;
            conflictFile = fileName;
            skippedFiles.push(fileName);
            entry.autodrain();
            parser.destroy(new Error(`目标文件已存在: ${fileName}`));
            return;
          }

          // 创建目录
          fs.mkdirSync(path.dirname(fullEntryPath), { recursive: true });
          
          // 写入文件
          entry.pipe(fs.createWriteStream(fullEntryPath))
            .on('finish', () => {
              extractedFiles.push(fileName);
            })
            .on('error', reject);
        })
        .on('close', resolve)
        .on('error', reject);
    });
    
    return {
      success: true,
      zipPath,
      extractPath: extractPath || path.basename(zipPath, '.zip'),
      fullExtractPath,
      overwrite,
      extractedCount: extractedFiles.length,
      skippedCount: skippedFiles.length,
      extractedFiles: extractedFiles.slice(0, 50), // 最多返回50个文件
      skippedFiles: skippedFiles.slice(0, 50)
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
    let fullZipPath;
    try {
      fullZipPath = resolveWorkspacePath(zipPath, sessionId);
    } catch (e) {
      return {
        success: false,
        error: e.message || `路径 ${zipPath} 超出 workspace 范围`
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
    const urlInfo = getPublicUrlInfo(fullZipPath, sessionId);
    
    return {
      success: true,
      path: zipPath,
      url: urlInfo?.fullUrl || null,
      fullUrl: urlInfo?.fullUrl || null,
      signedPath: urlInfo?.path || null,
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
    
    let fullZipPath;
    try {
      fullZipPath = resolveWorkspacePath(zipPath, sessionId);
    } catch (e) {
      return {
        success: false,
        error: e.message || `路径 ${zipPath} 超出 workspace 范围`
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

