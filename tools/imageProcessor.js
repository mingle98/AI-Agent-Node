// ========== 图片处理工具（压缩、调整尺寸、格式转换） ==========
import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import { resolveWorkspacePath, getPublicUrl } from './fileManager.js';
import { CONFIG } from '../config.js';

const SUPPORTED_INPUT_FORMATS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'tiff', 'bmp'];
const SUPPORTED_OUTPUT_FORMATS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'];

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * 压缩图片（支持 jpg/png/gif/webp/avif 等格式）
 * @param {string} sessionId - 用户会话ID
 * @param {string} inputPath - 输入图片路径（相对 workspace）
 * @param {string} outputPath - 输出图片路径（相对 workspace，可选，默认覆盖原文件）
 * @param {Object} options - 压缩选项
 * @returns {Promise<Object>}
 */
export async function compressImage(sessionId, inputPath, outputPath, options = {}) {
  try {
    if (!sessionId) throw new Error('需要提供 sessionId');
    if (!inputPath) throw new Error('需要提供输入图片路径');

    const {
      quality = 80,           // 压缩质量 1-100
      width = null,           // 目标宽度（像素，null 保持原始）
      height = null,          // 目标高度（像素，null 保持原始）
      fit = 'inside',         // 缩放方式：cover/contain/fill/inside/outside
      format = null,          // 输出格式（null 则保持原格式）
      overwrite = true,
      animated = true,        // 是否保留 GIF 动画帧
    } = options;

    // resolveWorkspacePath 内置越界校验，路径超出用户目录时直接抛出
    const absInput = resolveWorkspacePath(inputPath, sessionId);

    // 检查输入文件
    try {
      await fs.access(absInput);
    } catch {
      throw new Error(`输入文件不存在: ${inputPath}`);
    }

    const inputStats = await fs.stat(absInput);
    const inputExt = path.extname(inputPath).slice(1).toLowerCase();

    if (!SUPPORTED_INPUT_FORMATS.includes(inputExt)) {
      throw new Error(`不支持的图片格式: ${inputExt}，支持：${SUPPORTED_INPUT_FORMATS.join(', ')}`);
    }

    // 确定输出路径和格式（resolveWorkspacePath 同样做越界校验）
    const finalOutputPath = outputPath || inputPath;
    const absOutput = resolveWorkspacePath(finalOutputPath, sessionId);
    const outputExt = (format || path.extname(finalOutputPath).slice(1) || inputExt).toLowerCase();

    if (!SUPPORTED_OUTPUT_FORMATS.includes(outputExt)) {
      throw new Error(`不支持的输出格式: ${outputExt}，支持：${SUPPORTED_OUTPUT_FORMATS.join(', ')}`);
    }

    // 检查是否覆盖
    if (!overwrite && finalOutputPath !== inputPath) {
      try {
        await fs.access(absOutput);
        throw new Error(`输出文件已存在: ${finalOutputPath}，请设置 overwrite: true`);
      } catch (e) {
        if (e.message.includes('输出文件已存在')) throw e;
      }
    }

    await fs.mkdir(path.dirname(absOutput), { recursive: true });

    // 构建 sharp 处理管道
    const isGif = inputExt === 'gif';
    const pipeline = sharp(absInput, { animated: isGif && animated });

    // 调整尺寸
    if (width || height) {
      pipeline.resize({
        width: width || undefined,
        height: height || undefined,
        fit,
        withoutEnlargement: true,
      });
    }

    // 设置输出格式和质量
    switch (outputExt) {
      case 'jpg':
      case 'jpeg':
        pipeline.jpeg({ quality, mozjpeg: true });
        break;
      case 'png':
        pipeline.png({ quality, compressionLevel: Math.round((100 - quality) / 11) });
        break;
      case 'webp':
        pipeline.webp({ quality });
        break;
      case 'gif':
        pipeline.gif();
        break;
      case 'avif':
        pipeline.avif({ quality });
        break;
    }

    const isSameFile = path.resolve(absInput) === path.resolve(absOutput);
    const writeTarget = isSameFile ? `${absOutput}.tmp` : absOutput;

    await pipeline.toFile(writeTarget);

    if (isSameFile) {
      await fs.rename(writeTarget, absOutput);
    }

    const outputStats = await fs.stat(absOutput);
    const savedBytes = inputStats.size - outputStats.size;
    const savedPercent = ((savedBytes / inputStats.size) * 100).toFixed(1);

    const publicUrl = getPublicUrl(absOutput, sessionId);
    return {
      success: true,
      filePath: finalOutputPath,
      url: publicUrl,
      fullUrl: `${CONFIG.baseUrl}${publicUrl}`,
      size: outputStats.size,
      formattedSize: formatFileSize(outputStats.size),
      inputPath,
      inputSize: inputStats.size,
      inputSizeFormatted: formatFileSize(inputStats.size),
      savedBytes,
      savedBytesFormatted: formatFileSize(Math.abs(savedBytes)),
      savedPercent: parseFloat(savedPercent),
      quality,
      format: outputExt,
      message: savedBytes > 0
        ? `图片压缩成功: ${finalOutputPath}（${formatFileSize(inputStats.size)} → ${formatFileSize(outputStats.size)}，节省 ${savedPercent}%）\n访问地址: ${publicUrl}`
        : `图片转换成功: ${finalOutputPath}（${formatFileSize(outputStats.size)}）\n访问地址: ${publicUrl}`,
    };
  } catch (error) {
    return { success: false, error: error.message, filePath: outputPath || inputPath || null };
  }
}

/**
 * 批量压缩图片
 * @param {string} sessionId - 用户会话ID
 * @param {string[]} inputPaths - 输入图片路径数组
 * @param {string} outputDir - 输出目录（相对 workspace）
 * @param {Object} options - 压缩选项（同 compressImage）
 * @returns {Promise<Object>}
 */
export async function compressImageBatch(sessionId, inputPaths, outputDir, options = {}) {
  try {
    if (!sessionId) throw new Error('需要提供 sessionId');
    if (!Array.isArray(inputPaths) || inputPaths.length === 0) throw new Error('需要提供图片路径数组');

    const results = [];
    let totalInputSize = 0;
    let totalOutputSize = 0;
    let successCount = 0;
    let failCount = 0;

    for (const inputPath of inputPaths) {
      const fileName = path.basename(inputPath);
      const ext = path.extname(fileName).slice(1).toLowerCase();
      const outputFormat = options.format || ext;
      const outputFileName = options.format
        ? `${path.basename(fileName, path.extname(fileName))}.${options.format}`
        : fileName;
      const outputPath = outputDir ? `${outputDir}/${outputFileName}` : inputPath;

      const result = await compressImage(sessionId, inputPath, outputPath, options);
      results.push(result);

      if (result.success) {
        successCount++;
        totalInputSize += result.inputSize;
        totalOutputSize += result.size;
      } else {
        failCount++;
      }
    }

    const totalSaved = totalInputSize - totalOutputSize;
    const totalSavedPercent = totalInputSize > 0
      ? ((totalSaved / totalInputSize) * 100).toFixed(1)
      : '0';

    return {
      success: true,
      totalCount: inputPaths.length,
      successCount,
      failCount,
      totalInputSize,
      totalInputSizeFormatted: formatFileSize(totalInputSize),
      totalOutputSize,
      totalOutputSizeFormatted: formatFileSize(totalOutputSize),
      totalSaved,
      totalSavedFormatted: formatFileSize(Math.abs(totalSaved)),
      totalSavedPercent: parseFloat(totalSavedPercent),
      results,
      message: `批量压缩完成：${successCount}/${inputPaths.length} 成功，共节省 ${formatFileSize(Math.abs(totalSaved))}（${totalSavedPercent}%）`,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
