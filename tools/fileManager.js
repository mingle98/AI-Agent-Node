// ========== 用户隔离的文件管理系统 ==========

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { markdownToHtml } from '../utils/markdownRenderer.js';
import { CONFIG } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ========== 配置 ==========
const WORKSPACE_ROOT = path.join(__dirname, '..', 'public', 'workspace');
const ALLOWED_EXTENSIONS = new Set([
  // 文本文件
  'txt', 'md', 'json', 'js', 'ts', 'jsx', 'tsx', 'html', 'htm', 'css', 'scss', 'sass', 'less',
  // 编程语言
  'py', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'go', 'rs', 'rb', 'php', 'swift', 'kt',
  // 数据文件
  'csv', 'xml', 'yaml', 'yml',
  // 办公文档
  'xlsx', 'xls', 'docx', 'doc', 'pdf',
  // 图片
  'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico',
  // 其他
  'zip', 'tar', 'gz', 'log', 'sql'
]);

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_FILES_IN_DIR = 1000; // 单个目录最大文件数
const MAX_FILES_PER_USER = 100; // 每个用户最多文件数
const FILE_NAME_PATTERN = /^[a-zA-Z0-9_\-\.\u4e00-\u9fa5]+$/; // 支持中英文、数字、下划线、连字符、点

// 有效的 session ID 格式（字母、数字、连字符、下划线）
const SESSION_ID_PATTERN = /^[a-zA-Z0-9_\-]+$/;

// ========== 用户上下文管理 ==========

/**
 * 获取用户的 workspace 根目录
 * @param {string} sessionId - 用户会话ID
 * @returns {string} - 用户的 workspace 绝对路径
 */
export function getUserWorkspaceRoot(sessionId) {
  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error('需要提供有效的 sessionId 来访问文件系统');
  }
  
  // 验证 sessionId 格式（防止目录遍历）
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    throw new Error(`非法的 sessionId 格式: ${sessionId}`);
  }
  
  return path.join(WORKSPACE_ROOT, sessionId);
}

/**
 * 解析用户 workspace 内的路径
 * @param {string} relativePath - 相对路径
 * @param {string} sessionId - 用户会话ID
 * @returns {string} - 绝对路径
 * @throws {Error} - 路径非法时抛出错误
 */
export function resolveWorkspacePath(relativePath, sessionId) {
  // 获取用户专属的 workspace 根目录
  const userRoot = getUserWorkspaceRoot(sessionId);
  
  // 清理路径，移除 .. 等危险字符
  const cleanPath = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '');
  const absolutePath = path.join(userRoot, cleanPath);
  
  // 安全检查：确保路径在用户目录内
  const resolvedPath = path.resolve(absolutePath);
  const resolvedRoot = path.resolve(userRoot);
  
  if (!resolvedPath.startsWith(resolvedRoot)) {
    throw new Error(`路径越界: ${relativePath} 不在允许的用户目录内`);
  }
  
  return absolutePath;
}

/**
 * 初始化用户的 workspace 目录
 * @param {string} sessionId - 用户会话ID
 * @returns {Promise<Object>}
 */
export async function initUserWorkspace(sessionId) {
  try {
    if (!sessionId) {
      throw new Error('需要提供 sessionId');
    }
    
    const userRoot = getUserWorkspaceRoot(sessionId);
    await fs.mkdir(userRoot, { recursive: true });
    
    // 创建用户目录内的 .gitignore
    const gitignorePath = path.join(userRoot, '.gitignore');
    const gitignoreExists = await fs.stat(gitignorePath).catch(() => null);
    
    if (!gitignoreExists) {
      await fs.writeFile(gitignorePath, '# User workspace files\n*\n!.gitignore\n');
    }
    
    const urlInfo = getPublicUrlInfo(userRoot, sessionId);
    
    return {
      success: true,
      sessionId: sessionId,
      path: userRoot,
      url: urlInfo.path,
      fullUrl: urlInfo.fullUrl,
      message: `用户 Workspace 初始化成功\n访问地址: ${urlInfo.fullUrl}/`
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      sessionId: sessionId
    };
  }
}

/**
 * 统计用户 workspace 中的文件数量（递归）
 * @param {string} sessionId - 用户会话ID
 * @returns {Promise<number>} - 文件总数
 */
async function countUserFiles(sessionId) {
  try {
    const userRoot = getUserWorkspaceRoot(sessionId);
    let count = 0;
    
    async function countRecursive(dirPath) {
      const items = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const item of items) {
        if (item.name.startsWith('.')) continue;
        
        const fullPath = path.join(dirPath, item.name);
        
        if (item.isDirectory()) {
          await countRecursive(fullPath);
        } else {
          count++;
        }
      }
    }
    
    const stats = await fs.stat(userRoot).catch(() => null);
    if (stats && stats.isDirectory()) {
      await countRecursive(userRoot);
    }
    
    return count;
  } catch (error) {
    return 0;
  }
}

/**
 * 检查用户文件数量限制
 * @param {string} sessionId - 用户会话ID
 * @param {boolean} isNewFile - 是否是新文件（不是覆盖）
 * @returns {Promise<void>}
 * @throws {Error} 超过限制时抛出错误
 */
async function checkUserFileLimit(sessionId, isNewFile = true) {
  if (!isNewFile) return; // 覆盖现有文件不增加数量
  
  const fileCount = await countUserFiles(sessionId);
  
  if (fileCount >= MAX_FILES_PER_USER) {
    throw new Error(`您的文件数量已达到上限 ${MAX_FILES_PER_USER} 个，请先删除一些文件后再创建新文件。当前文件数: ${fileCount}`);
  }
}

/**
 * 统计用户存储空间使用情况
 * @param {string} sessionId - 用户会话ID
 * @returns {Promise<Object>} - 存储统计信息
 */
export async function getUserStorageStats(sessionId) {
  try {
    const userRoot = getUserWorkspaceRoot(sessionId);
    let totalSize = 0;
    let fileCount = 0;
    let dirCount = 0;
    
    async function calculateRecursive(dirPath) {
      const items = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const item of items) {
        if (item.name.startsWith('.')) continue;
        
        const fullPath = path.join(dirPath, item.name);
        const stats = await fs.stat(fullPath);
        
        if (item.isDirectory()) {
          dirCount++;
          await calculateRecursive(fullPath);
        } else {
          totalSize += stats.size;
          fileCount++;
        }
      }
    }
    
    const stats = await fs.stat(userRoot).catch(() => null);
    if (stats && stats.isDirectory()) {
      await calculateRecursive(userRoot);
    }
    
    const MAX_STORAGE = 200 * 1024 * 1024; // 200MB
    
    return {
      success: true,
      sessionId,
      usedSize: totalSize,
      usedSizeFormatted: formatFileSize(totalSize),
      maxSize: MAX_STORAGE,
      maxSizeFormatted: formatFileSize(MAX_STORAGE),
      remainingSize: MAX_STORAGE - totalSize,
      remainingSizeFormatted: formatFileSize(MAX_STORAGE - totalSize),
      usedPercent: ((totalSize / MAX_STORAGE) * 100).toFixed(2),
      fileCount,
      directoryCount: dirCount
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      sessionId
    };
  }
}

/**
 * 检查用户存储配额
 * @param {string} sessionId - 用户会话ID
 * @param {number} additionalBytes - 要添加的字节数
 * @returns {Promise<void>}
 * @throws {Error} 超过配额时抛出错误
 */
export async function checkUserStorageQuota(sessionId, additionalBytes = 0) {
  const MAX_STORAGE = 200 * 1024 * 1024; // 200MB
  
  const stats = await getUserStorageStats(sessionId);
  if (!stats.success) {
    throw new Error(`无法获取存储统计信息: ${stats.error}`);
  }
  
  const projectedSize = stats.usedSize + additionalBytes;
  
  if (projectedSize > MAX_STORAGE) {
    throw new Error(`存储空间不足。当前已用: ${stats.usedSizeFormatted}，限制: ${stats.maxSizeFormatted}，尝试添加: ${formatFileSize(additionalBytes)}。请删除一些文件后重试。`);
  }
}

/**
 * 验证文件名是否合法
 * @param {string} filename - 文件名
 * @returns {boolean}
 */
function validateFilename(filename) {
  if (!filename || typeof filename !== 'string') {
    return false;
  }
  
  // 检查长度
  if (filename.length > 255) {
    return false;
  }
  
  // 检查是否包含非法字符
  if (filename.includes('/') || filename.includes('\\') || filename.includes('\0')) {
    return false;
  }
  
  // 检查是否以.开头（隐藏文件）
  if (filename.startsWith('.')) {
    return false;
  }
  
  return FILE_NAME_PATTERN.test(filename);
}

/**
 * 获取文件扩展名并验证是否允许
 * @param {string} filename - 文件名
 * @returns {string|null} - 扩展名或null
 */
function validateFileExtension(filename) {
  const ext = path.extname(filename).toLowerCase().slice(1);
  if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error(`不支持的文件类型: .${ext || '无扩展名'}。支持的类型: ${Array.from(ALLOWED_EXTENSIONS).join(', ')}`);
  }
  return ext;
}

/**
 * 获取公共访问URL
 * @param {string} absolutePath - 绝对路径
 * @param {string} sessionId - 用户会话ID
 * @returns {string} - 可访问的URL路径
 */
export function getPublicUrl(absolutePath, sessionId) {
  const userRoot = getUserWorkspaceRoot(sessionId);
  const resolvedPath = path.resolve(absolutePath);
  const resolvedRoot = path.resolve(userRoot);
  
  if (!resolvedPath.startsWith(resolvedRoot)) {
    return null;
  }
  
  const relativePath = resolvedPath.slice(resolvedRoot.length).replace(/\\/g, '/');
  return `/workspace/${sessionId}${relativePath}`;
}

/**
 * 获取公共访问URL（包含完整URL）
 * @param {string} absolutePath - 绝对路径
 * @param {string} sessionId - 用户会话ID
 * @returns {Object} - 包含相对路径和完整URL的对象
 */
function getPublicUrlInfo(absolutePath, sessionId) {
  const userRoot = getUserWorkspaceRoot(sessionId);
  const resolvedPath = path.resolve(absolutePath);
  const resolvedRoot = path.resolve(userRoot);
  
  if (!resolvedPath.startsWith(resolvedRoot)) {
    return null;
  }
  
  const relativePath = resolvedPath.slice(resolvedRoot.length).replace(/\\/g, '/');
  const urlPath = `/workspace/${sessionId}${relativePath}`;
  
  return {
    path: urlPath,
    fullUrl: `${CONFIG.baseUrl}${urlPath}`
  };
}

// ========== 文件操作核心函数 ==========

/**
 * 列出目录内容
 * @param {string} dirPath - 目录路径（相对用户workspace）
 * @param {string} sessionId - 用户会话ID
 * @param {Object} options - 选项
 * @param {boolean} options.recursive - 是否递归列出
 * @param {string} options.filter - 文件类型过滤
 * @returns {Promise<Object>}
 */
export async function listDirectory(sessionId, dirPath = '', options = {}) {
  try {
    if (!sessionId) {
      throw new Error('需要提供 sessionId 来访问文件系统');
    }
    
    const { recursive = false, filter = null } = options;
    
    // 首先确保用户目录存在（自动初始化）
    const userRoot = getUserWorkspaceRoot(sessionId);
    const userRootStats = await fs.stat(userRoot).catch(() => null);
    if (!userRootStats) {
      // 自动初始化用户目录
      await initUserWorkspace(sessionId);
    }
    
    const absolutePath = resolveWorkspacePath(dirPath, sessionId);
    
    // 确保目录存在
    const stats = await fs.stat(absolutePath).catch(() => null);
    if (!stats || !stats.isDirectory()) {
      throw new Error(`目录不存在: ${dirPath || '根目录'}`);
    }
    
    const items = await fs.readdir(absolutePath, { withFileTypes: true });
    
    const urlInfo = getPublicUrlInfo(absolutePath, sessionId);
    
    const result = {
      path: dirPath || '/',
      url: urlInfo.path,
      fullUrl: urlInfo.fullUrl,
      sessionId: sessionId,
      treeView: '',
      items: [],
      stats: {
        total: 0,
        files: 0,
        directories: 0
      }
    };
    
    for (const item of items) {
      // 跳过隐藏文件
      if (item.name.startsWith('.')) continue;
      
      const itemPath = path.join(dirPath, item.name);
      const itemAbsolutePath = path.join(absolutePath, item.name);
      const itemStats = await fs.stat(itemAbsolutePath);
      
      const itemUrlInfo = getPublicUrlInfo(itemAbsolutePath, sessionId);
      const fileInfo = {
        name: item.name,
        type: item.isDirectory() ? 'directory' : 'file',
        path: itemPath,
        url: itemUrlInfo.path,
        fullUrl: itemUrlInfo.fullUrl,
        size: itemStats.size,
        formattedSize: formatFileSize(itemStats.size),
        modifiedAt: itemStats.mtime.toISOString(),
        createdAt: itemStats.birthtime.toISOString()
      };
      
      // 过滤
      if (filter && !item.isDirectory()) {
        const ext = path.extname(item.name).toLowerCase().slice(1);
        if (ext !== filter.toLowerCase()) continue;
      }
      
      if (item.isDirectory() && recursive) {
        // 递归获取子目录内容
        const subResult = await listDirectory(sessionId, itemPath, { recursive: true });
        fileInfo.children = subResult.items;
      }
      
      result.items.push(fileInfo);
      result.stats.total++;
      if (item.isDirectory()) {
        result.stats.directories++;
      } else {
        result.stats.files++;
      }
    }
    
    // 排序：目录在前，文件在后，按名称排序
    result.items.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
    
    // 生成树形结构视图
    result.treeView = generateTreeView(result.items, dirPath || '/');
    
    return {
      success: true,
      ...result,
      message: `目录列出成功: ${result.path}\n访问地址: ${result.fullUrl}/\n\n📂 目录结构:\n\`\`\`\n${result.treeView}\n\`\`\``
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      path: dirPath
    };
  }
}

/**
 * 读取文件内容
 * @param {string} filePath - 文件路径（相对用户workspace）
 * @param {string} sessionId - 用户会话ID
 * @param {Object} options - 选项
 * @param {string} options.encoding - 编码（默认utf-8）
 * @param {number} options.maxSize - 最大读取字节数
 * @returns {Promise<Object>}
 */
export async function readFile(sessionId, filePath, options = {}) {
  try {
    if (!sessionId) {
      throw new Error('需要提供 sessionId 来访问文件系统');
    }
    
    const { encoding = 'utf-8', maxSize = 10 * 1024 * 1024 } = options;
    
    // 首先确保用户目录存在（自动初始化）
    const userRoot = getUserWorkspaceRoot(sessionId);
    const userRootStats = await fs.stat(userRoot).catch(() => null);
    if (!userRootStats) {
      await initUserWorkspace(sessionId);
    }
    
    // 验证路径和扩展名
    const absolutePath = resolveWorkspacePath(filePath, sessionId);
    validateFileExtension(path.basename(filePath));
    
    // 检查文件存在
    const stats = await fs.stat(absolutePath).catch(() => null);
    if (!stats || !stats.isFile()) {
      throw new Error(`文件不存在: ${filePath}`);
    }
    
    // 检查文件大小
    if (stats.size > MAX_FILE_SIZE) {
      throw new Error(`文件过大: ${formatFileSize(stats.size)}，超过限制 ${formatFileSize(MAX_FILE_SIZE)}`);
    }
    
    // 读取文件
    let content;
    const ext = path.extname(filePath).toLowerCase().slice(1);
    
    // 图片和二进制文件返回基本信息，不读取内容
    const isImage = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico'].includes(ext);
    const isBinary = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'zip', 'tar', 'gz'].includes(ext);
    
    if (isImage) {
      content = null;
    } else if (isBinary) {
      content = null;
    } else {
      // 限制读取大小
      const readSize = Math.min(stats.size, maxSize);
      const buffer = await fs.readFile(absolutePath);
      content = buffer.slice(0, readSize).toString(encoding);
      
      // 如果截断了，添加提示
      if (stats.size > maxSize) {
        content += `\n\n[文件内容已截断，仅显示前 ${formatFileSize(maxSize)}，完整文件大小: ${formatFileSize(stats.size)}]`;
      }
    }
    
    return {
      success: true,
      name: path.basename(filePath),
      path: filePath,
      url: getPublicUrl(absolutePath, sessionId),
      fullUrl: `${CONFIG.baseUrl}${getPublicUrl(absolutePath, sessionId)}`,
      absolutePath: absolutePath,
      type: ext,
      size: stats.size,
      formattedSize: formatFileSize(stats.size),
      modifiedAt: stats.mtime.toISOString(),
      createdAt: stats.birthtime.toISOString(),
      content: content,
      isTruncated: stats.size > maxSize,
      isBinary: isBinary || isImage,
      isImage: isImage,
      message: isImage 
        ? `这是图片文件，可通过以下地址访问:\n${getPublicUrl(absolutePath, sessionId)}\n完整地址: ${CONFIG.baseUrl}${getPublicUrl(absolutePath, sessionId)}`
        : isBinary 
          ? `这是二进制文件，可通过以下地址下载:\n${getPublicUrl(absolutePath, sessionId)}\n完整地址: ${CONFIG.baseUrl}${getPublicUrl(absolutePath, sessionId)}`
          : `文件内容已读取，访问地址: ${CONFIG.baseUrl}${getPublicUrl(absolutePath, sessionId)}`
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      path: filePath
    };
  }
}

/**
 * 检测内容是否为 Markdown 格式
 * @param {string} content - 内容
 * @returns {boolean}
 */
function isMarkdownContent(content) {
  if (!content || typeof content !== 'string') return false;
  
  // Markdown 特征检测
  const markdownPatterns = [
    /^#{1,6}\s+/m,           // 标题
    /\*\*.*?\*\*/,           // 粗体
    /\*.*?\*/,               // 斜体
    /`{3}.*?`{3}/s,          // 代码块
    /`[^`]+`/,               // 行内代码
    /^\-|\*\s+/m,           // 列表
    /^\d+\.\s+/m,           // 有序列表
    /^\>\s+/m,              // 引用
    /\[.*?\]\(.*?\)/,       // 链接
    /!\[.*?\]\(.*?\)/,      // 图片
    /~~.*?~~/,              // 删除线
    /^---+/m,               // 分割线
  ];
  
  // 至少匹配 2 个特征才认为是 Markdown
  let matchCount = 0;
  for (const pattern of markdownPatterns) {
    if (pattern.test(content)) {
      matchCount++;
      if (matchCount >= 2) return true;
    }
  }
  
  return false;
}

/**
 * 创建/写入文件（智能格式转换）
 * @param {string} filePath - 文件路径（相对用户workspace）
 * @param {string} sessionId - 用户会话ID
 * @param {string|Buffer} content - 文件内容
 * @param {Object} options - 选项
 * @param {boolean} options.overwrite - 是否覆盖已有文件
 * @param {string} options.encoding - 编码
 * @param {boolean} options.autoFormat - 是否自动格式化 Markdown 为 HTML（默认true）
 * @returns {Promise<Object>}
 */
export async function writeFile(sessionId, filePath, content, options = {}) {
  try {
    if (!sessionId) {
      throw new Error('需要提供 sessionId 来访问文件系统');
    }
    
    const { overwrite = false, encoding = 'utf-8', autoFormat = true } = options;
    
    // 智能格式检测：如果是 Markdown 内容且目标不是 .md/.html，自动转 HTML
    let finalPath = filePath;
    let finalContent = content;
    let isConverted = false;
    
    if (autoFormat && typeof content === 'string' && !filePath.endsWith('.md') && !filePath.endsWith('.html')) {
      if (isMarkdownContent(content)) {
        // 将目标路径改为 .html
        const baseName = path.basename(filePath, path.extname(filePath));
        finalPath = path.join(path.dirname(filePath), baseName + '.html');
        
        // 转换为 HTML
        finalContent = markdownToHtml(content, {
          title: baseName,
          theme: 'default'
        });
        isConverted = true;
      }
    }
    
    // 验证文件名
    const filename = path.basename(finalPath);
    if (!validateFilename(filename.replace(/\.[^.]+$/, ''))) {
      throw new Error(`非法文件名: ${filename}`);
    }
    
    // 验证扩展名
    validateFileExtension(filename);
    
    const absolutePath = resolveWorkspacePath(finalPath, sessionId);
    const dirPath = path.dirname(absolutePath);
    
    // 确保目录存在
    await fs.mkdir(dirPath, { recursive: true });
    
    // 检查是否已存在
    const exists = await fs.stat(absolutePath).catch(() => null);
    if (exists && !overwrite) {
      throw new Error(`文件已存在: ${finalPath}，如需覆盖请设置 overwrite: true`);
    }
    
    // 检查用户文件数量限制（仅针对新文件）
    await checkUserFileLimit(sessionId, !!exists);
    
    // 检查存储配额
    const contentBuffer = typeof finalContent === 'string' 
      ? Buffer.from(finalContent, encoding) 
      : finalContent;
    
    if (!exists) {
      await checkUserStorageQuota(sessionId, contentBuffer.length);
    }
    
    // 检查目录文件数量限制
    const parentItems = await fs.readdir(dirPath);
    if (parentItems.length >= MAX_FILES_IN_DIR && !exists) {
      throw new Error(`目录文件数量超限`);
    }
    
    // 写入文件
    if (contentBuffer.length > MAX_FILE_SIZE) {
      throw new Error(`文件内容过大`);
    }
    
    await fs.writeFile(absolutePath, contentBuffer);
    
    const stats = await fs.stat(absolutePath);
    
    const result = {
      success: true,
      operation: exists ? 'updated' : 'created',
      name: filename,
      path: finalPath,
      url: getPublicUrl(absolutePath, sessionId),
      fullUrl: `${CONFIG.baseUrl}${getPublicUrl(absolutePath, sessionId)}`,
      absolutePath: absolutePath,
      size: stats.size,
      formattedSize: formatFileSize(stats.size),
      modifiedAt: stats.mtime.toISOString(),
      createdAt: stats.birthtime.toISOString(),
      message: `文件${exists ? '更新' : '创建'}成功: ${filename}\n访问地址: ${getPublicUrl(absolutePath, sessionId)}\n完整地址: ${CONFIG.baseUrl}${getPublicUrl(absolutePath, sessionId)}`
    };
    
    // 如果进行了格式转换，添加提示信息
    if (isConverted) {
      result.originalPath = filePath;
      result.isConverted = true;
      result.convertedType = 'html';
      result.fullUrl = `${CONFIG.baseUrl}${getPublicUrl(absolutePath, sessionId)}`;
      result.message = `富文本文件${exists ? '更新' : '创建'}成功: ${filename}\n检测到 Markdown 格式，已自动转换为 HTML\n访问地址: ${getPublicUrl(absolutePath, sessionId)}\n完整地址: ${CONFIG.baseUrl}${getPublicUrl(absolutePath, sessionId)}`;
    }
    
    return result;
  } catch (error) {
    return {
      success: false,
      error: error.message,
      path: filePath
    };
  }
}

/**
 * 删除文件或目录
 * @param {string} targetPath - 目标路径（相对用户workspace）
 * @param {string} sessionId - 用户会话ID
 * @param {Object} options - 选项
 * @param {boolean} options.recursive - 是否递归删除目录
 * @returns {Promise<Object>}
 */
export async function deleteFile(sessionId, targetPath, options = {}) {
  try {
    if (!sessionId) {
      throw new Error('需要提供 sessionId 来访问文件系统');
    }
    
    const { recursive = false } = options;
    
    const absolutePath = resolveWorkspacePath(targetPath, sessionId);
    
    // 检查目标存在
    const stats = await fs.stat(absolutePath).catch(() => null);
    if (!stats) {
      throw new Error(`目标不存在: ${targetPath}`);
    }
    
    const isDirectory = stats.isDirectory();
    const name = path.basename(targetPath);
    
    if (isDirectory) {
      // 检查是否为空目录
      const items = await fs.readdir(absolutePath);
      const visibleItems = items.filter(item => !item.startsWith('.'));
      
      if (visibleItems.length > 0 && !recursive) {
        throw new Error(`目录非空: ${targetPath} 包含 ${visibleItems.length} 个项目，如需递归删除请设置 recursive: true`);
      }
      
      await fs.rm(absolutePath, { recursive: true, force: true });
    } else {
      await fs.unlink(absolutePath);
    }
    
    return {
      success: true,
      operation: 'deleted',
      type: isDirectory ? 'directory' : 'file',
      name: name,
      path: targetPath,
      message: `${isDirectory ? '目录' : '文件'}删除成功: ${name}`
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      path: targetPath
    };
  }
}

/**
 * 创建目录
 * @param {string} dirPath - 目录路径（相对用户workspace）
 * @param {string} sessionId - 用户会话ID
 * @param {Object} options - 选项
 * @param {boolean} options.recursive - 是否递归创建父目录
 * @returns {Promise<Object>}
 */
export async function createDirectory(sessionId, dirPath, options = {}) {
  try {
    if (!sessionId) {
      throw new Error('需要提供 sessionId 来访问文件系统');
    }
    
    const { recursive = true } = options;
    
    // 验证路径中的每个目录名
    const parts = dirPath.split(/[\/]/).filter(p => p);
    for (const part of parts) {
      if (!validateFilename(part)) {
        throw new Error(`非法目录名: ${part}`);
      }
    }
    
    const absolutePath = resolveWorkspacePath(dirPath, sessionId);
    
    // 检查是否已存在
    const exists = await fs.stat(absolutePath).catch(() => null);
    if (exists) {
      throw new Error(`目标已存在: ${dirPath}`);
    }
    
    await fs.mkdir(absolutePath, { recursive });
    
    const stats = await fs.stat(absolutePath);
    
    return {
      success: true,
      operation: 'created',
      type: 'directory',
      name: path.basename(dirPath),
      path: dirPath,
      url: getPublicUrl(absolutePath, sessionId),
      fullUrl: `${CONFIG.baseUrl}${getPublicUrl(absolutePath, sessionId)}`,
      absolutePath: absolutePath,
      modifiedAt: stats.mtime.toISOString(),
      createdAt: stats.birthtime.toISOString(),
      message: `目录创建成功: ${dirPath}\n访问地址: ${getPublicUrl(absolutePath, sessionId)}/\n完整地址: ${CONFIG.baseUrl}${getPublicUrl(absolutePath, sessionId)}/`
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      path: dirPath
    };
  }
}

/**
 * 移动/重命名文件或目录
 * @param {string} sourcePath - 源路径
 * @param {string} targetPath - 目标路径
 * @param {string} sessionId - 用户会话ID
 * @param {Object} options - 选项
 * @param {boolean} options.overwrite - 是否覆盖
 * @returns {Promise<Object>}
 */
export async function moveFile(sessionId, sourcePath, targetPath, options = {}) {
  try {
    if (!sessionId) {
      throw new Error('需要提供 sessionId 来访问文件系统');
    }
    
    const { overwrite = false } = options;
    
    // 验证目标文件名
    const targetName = path.basename(targetPath);
    if (!validateFilename(targetName)) {
      throw new Error(`非法文件名: ${targetName}`);
    }
    
    const sourceAbsolute = resolveWorkspacePath(sourcePath, sessionId);
    const targetAbsolute = resolveWorkspacePath(targetPath, sessionId);
    
    // 检查源文件存在
    const sourceStats = await fs.stat(sourceAbsolute).catch(() => null);
    if (!sourceStats) {
      throw new Error(`源文件不存在: ${sourcePath}`);
    }
    
    // 检查目标是否已存在
    const targetExists = await fs.stat(targetAbsolute).catch(() => null);
    if (targetExists && !overwrite) {
      throw new Error(`目标已存在: ${targetPath}，如需覆盖请设置 overwrite: true`);
    }
    
    // 确保目标目录存在
    await fs.mkdir(path.dirname(targetAbsolute), { recursive: true });
    
    await fs.rename(sourceAbsolute, targetAbsolute);
    
    const stats = await fs.stat(targetAbsolute);
    
    return {
      success: true,
      operation: 'moved',
      type: sourceStats.isDirectory() ? 'directory' : 'file',
      name: targetName,
      sourcePath: sourcePath,
      targetPath: targetPath,
      url: getPublicUrl(targetAbsolute, sessionId),
      fullUrl: `${CONFIG.baseUrl}${getPublicUrl(targetAbsolute, sessionId)}`,
      absolutePath: targetAbsolute,
      size: stats.size,
      formattedSize: formatFileSize(stats.size),
      modifiedAt: stats.mtime.toISOString(),
      createdAt: stats.birthtime.toISOString(),
      message: `${sourceStats.isDirectory() ? '目录' : '文件'}移动成功: ${sourcePath} -> ${targetPath}\n访问地址: ${getPublicUrl(targetAbsolute, sessionId)}\n完整地址: ${CONFIG.baseUrl}${getPublicUrl(targetAbsolute, sessionId)}`
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      sourcePath: sourcePath,
      targetPath: targetPath
    };
  }
}

/**
 * 复制文件或目录
 * @param {string} sourcePath - 源路径
 * @param {string} targetPath - 目标路径
 * @param {string} sessionId - 用户会话ID
 * @param {Object} options - 选项
 * @param {boolean} options.overwrite - 是否覆盖
 * @param {boolean} options.recursive - 是否递归复制目录
 * @returns {Promise<Object>}
 */
export async function copyFile(sessionId, sourcePath, targetPath, options = {}) {
  try {
    if (!sessionId) {
      throw new Error('需要提供 sessionId 来访问文件系统');
    }
    
    const { overwrite = false, recursive = true } = options;
    
    // 验证目标文件名
    const targetName = path.basename(targetPath);
    if (!validateFilename(targetName)) {
      throw new Error(`非法文件名: ${targetName}`);
    }
    
    const sourceAbsolute = resolveWorkspacePath(sourcePath, sessionId);
    const targetAbsolute = resolveWorkspacePath(targetPath, sessionId);
    
    // 检查源文件存在
    const sourceStats = await fs.stat(sourceAbsolute).catch(() => null);
    if (!sourceStats) {
      throw new Error(`源文件不存在: ${sourcePath}`);
    }
    
    // 检查目标是否已存在
    const targetExists = await fs.stat(targetAbsolute).catch(() => null);
    if (targetExists && !overwrite) {
      throw new Error(`目标已存在: ${targetPath}，如需覆盖请设置 overwrite: true`);
    }
    
    const isDirectory = sourceStats.isDirectory();
    
    // 确保目标目录存在
    await fs.mkdir(path.dirname(targetAbsolute), { recursive: true });
    
    if (isDirectory && recursive) {
      await fs.cp(sourceAbsolute, targetAbsolute, { recursive: true, force: overwrite });
    } else {
      await fs.copyFile(sourceAbsolute, targetAbsolute);
    }
    
    const stats = await fs.stat(targetAbsolute);
    
    return {
      success: true,
      operation: 'copied',
      type: isDirectory ? 'directory' : 'file',
      name: targetName,
      sourcePath: sourcePath,
      targetPath: targetPath,
      url: getPublicUrl(targetAbsolute, sessionId),
      fullUrl: `${CONFIG.baseUrl}${getPublicUrl(targetAbsolute, sessionId)}`,
      absolutePath: targetAbsolute,
      size: stats.size,
      formattedSize: formatFileSize(stats.size),
      modifiedAt: stats.mtime.toISOString(),
      createdAt: stats.birthtime.toISOString(),
      message: `${isDirectory ? '目录' : '文件'}复制成功: ${sourcePath} -> ${targetPath}\n访问地址: ${getPublicUrl(targetAbsolute, sessionId)}\n完整地址: ${CONFIG.baseUrl}${getPublicUrl(targetAbsolute, sessionId)}`
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      sourcePath: sourcePath,
      targetPath: targetPath
    };
  }
}

/**
 * 获取文件/目录信息
 * @param {string} targetPath - 目标路径
 * @param {string} sessionId - 用户会话ID
 * @returns {Promise<Object>}
 */
export async function getFileInfo(sessionId, targetPath) {
  try {
    if (!sessionId) {
      throw new Error('需要提供 sessionId 来访问文件系统');
    }
    
    // 首先确保用户目录存在（自动初始化）
    const userRoot = getUserWorkspaceRoot(sessionId);
    const userRootStats = await fs.stat(userRoot).catch(() => null);
    if (!userRootStats) {
      await initUserWorkspace(sessionId);
    }
    
    const absolutePath = resolveWorkspacePath(targetPath, sessionId);
    
    const stats = await fs.stat(absolutePath).catch(() => null);
    if (!stats) {
      throw new Error(`目标不存在: ${targetPath}`);
    }
    
    const isDirectory = stats.isDirectory();
    const ext = isDirectory ? null : path.extname(targetPath).toLowerCase().slice(1);
    
    const result = {
      success: true,
      name: path.basename(targetPath),
      path: targetPath,
      absolutePath: absolutePath,
      url: getPublicUrl(absolutePath, sessionId),
      fullUrl: `${CONFIG.baseUrl}${getPublicUrl(absolutePath, sessionId)}`,
      type: isDirectory ? 'directory' : (ext || 'file'),
      isDirectory: isDirectory,
      size: stats.size,
      formattedSize: formatFileSize(stats.size),
      modifiedAt: stats.mtime.toISOString(),
      createdAt: stats.birthtime.toISOString(),
      accessedAt: stats.atime.toISOString(),
      permissions: {
        readable: !!(stats.mode & 0o400),
        writable: !!(stats.mode & 0o200),
        executable: !!(stats.mode & 0o100)
      }
    };
    
    // 如果是目录，添加子项统计
    if (isDirectory) {
      const items = await fs.readdir(absolutePath);
      result.childrenCount = items.filter(item => !item.startsWith('.')).length;
    }
    
    return result;
  } catch (error) {
    return {
      success: false,
      error: error.message,
      path: targetPath
    };
  }
}

/**
 * 搜索文件
 * @param {string} keyword - 搜索关键词
 * @param {string} sessionId - 用户会话ID
 * @param {string} dirPath - 搜索目录
 * @param {Object} options - 选项
 * @param {boolean} options.recursive - 是否递归搜索
 * @param {string} options.extension - 按扩展名过滤
 * @returns {Promise<Object>}
 */
export async function searchFiles(sessionId, keyword, dirPath = '', options = {}) {
  try {
    if (!sessionId) {
      throw new Error('需要提供 sessionId 来访问文件系统');
    }
    
    const { recursive = true, extension = null } = options;
    
    // 首先确保用户目录存在（自动初始化）
    const userRoot = getUserWorkspaceRoot(sessionId);
    const userRootStats = await fs.stat(userRoot).catch(() => null);
    if (!userRootStats) {
      await initUserWorkspace(sessionId);
    }
    
    const absolutePath = resolveWorkspacePath(dirPath, sessionId);
    
    const stats = await fs.stat(absolutePath).catch(() => null);
    if (!stats || !stats.isDirectory()) {
      throw new Error(`目录不存在: ${dirPath || '根目录'}`);
    }
    
    const results = [];
    
    async function search(currentPath, currentAbsolute) {
      const items = await fs.readdir(currentAbsolute, { withFileTypes: true });
      
      for (const item of items) {
        if (item.name.startsWith('.')) continue;
        
        const itemPath = path.join(currentPath, item.name);
        const itemAbsolute = path.join(currentAbsolute, item.name);
        
        // 检查文件名是否匹配
        if (item.name.toLowerCase().includes(keyword.toLowerCase())) {
          const itemStats = await fs.stat(itemAbsolute);
          results.push({
            name: item.name,
            path: itemPath,
            url: getPublicUrl(itemAbsolute, sessionId),
            fullUrl: `${CONFIG.baseUrl}${getPublicUrl(itemAbsolute, sessionId)}`,
            type: item.isDirectory() ? 'directory' : 'file',
            size: itemStats.size,
            formattedSize: formatFileSize(itemStats.size),
            modifiedAt: itemStats.mtime.toISOString()
          });
        }
        
        // 递归搜索子目录
        if (item.isDirectory() && recursive) {
          await search(itemPath, itemAbsolute);
        }
      }
    }
    
    await search(dirPath, absolutePath);
    
    return {
      success: true,
      keyword: keyword,
      searchPath: dirPath || '/',
      count: results.length,
      results: results
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      keyword: keyword
    };
  }
}

/**
 * 批量文件操作
 * @param {string} sessionId - 用户会话ID
 * @param {Array<Object>} operations - 操作列表
 * @returns {Promise<Object>}
 */
export async function batchFileOperations(sessionId, operations) {
  if (!sessionId) {
    return {
      success: false,
      error: '需要提供 sessionId 来访问文件系统',
      total: operations.length,
      successCount: 0,
      failCount: operations.length,
      results: []
    };
  }
  
  const results = [];
  let successCount = 0;
  let failCount = 0;
  
  for (const op of operations) {
    const { type, ...params } = op;
    let result;
    
    try {
      switch (type) {
        case 'write':
          result = await writeFile(sessionId, params.path, params.content, params.options);
          break;
        case 'delete':
          result = await deleteFile(sessionId, params.path, params.options);
          break;
        case 'move':
          result = await moveFile(sessionId, params.source, params.target, params.options);
          break;
        case 'copy':
          result = await copyFile(sessionId, params.source, params.target, params.options);
          break;
        case 'mkdir':
          result = await createDirectory(sessionId, params.path, params.options);
          break;
        default:
          result = { success: false, error: `未知操作类型: ${type}` };
      }
    } catch (error) {
      result = { success: false, error: error.message };
    }
    
    results.push({ type, params, result });
    
    if (result.success) {
      successCount++;
    } else {
      failCount++;
    }
  }
  
  return {
    success: failCount === 0,
    total: operations.length,
    successCount,
    failCount,
    results
  };
}

// ========== 工具函数 ==========

/**
 * 保存富文本文件（Markdown 自动转 HTML）
 * @param {string} filePath - 文件路径（会自动转为 .html）
 * @param {string} sessionId - 用户会话ID
 * @param {string} markdownContent - Markdown 内容
 * @param {Object} options - 选项
 * @param {string} options.title - HTML 页面标题
 * @param {string} options.theme - 主题 (default, dark, elegant)
 * @param {boolean} options.overwrite - 是否覆盖
 * @returns {Promise<Object>}
 */
export async function saveRichText(sessionId, filePath, markdownContent, options = {}) {
  try {
    if (!sessionId) {
      throw new Error('需要提供 sessionId 来访问文件系统');
    }
    
    const { title, theme = 'default', overwrite = false } = options;
    
    // 确保文件路径是 .html 结尾
    let htmlPath = filePath;
    if (filePath.endsWith('.md')) {
      htmlPath = filePath.replace(/\.md$/, '.html');
    } else if (!filePath.endsWith('.html')) {
      htmlPath = filePath + '.html';
    }
    
    // 验证文件名
    const filename = path.basename(htmlPath);
    if (!validateFilename(filename.replace('.html', ''))) {
      throw new Error(`非法文件名: ${filename}`);
    }
    
    // 转换为 HTML
    const htmlContent = markdownToHtml(markdownContent, {
      title: title || filename.replace('.html', ''),
      theme
    });
    
    const absolutePath = resolveWorkspacePath(htmlPath, sessionId);
    const dirPath = path.dirname(absolutePath);
    
    // 确保目录存在
    await fs.mkdir(dirPath, { recursive: true });
    
    // 检查是否已存在
    const exists = await fs.stat(absolutePath).catch(() => null);
    if (exists && !overwrite) {
      throw new Error(`文件已存在: ${htmlPath}，如需覆盖请设置 overwrite: true`);
    }
    
    // 写入 HTML 文件
    await fs.writeFile(absolutePath, htmlContent, 'utf-8');
    
    const stats = await fs.stat(absolutePath);
    
    return {
      success: true,
      operation: exists ? 'updated' : 'created',
      name: filename,
      originalPath: filePath,
      path: htmlPath,
      url: getPublicUrl(absolutePath, sessionId),
      absolutePath: absolutePath,
      size: stats.size,
      formattedSize: formatFileSize(stats.size),
      type: 'html',
      theme: theme,
      modifiedAt: stats.mtime.toISOString(),
      createdAt: stats.birthtime.toISOString(),
      fullUrl: `${CONFIG.baseUrl}${getPublicUrl(absolutePath, sessionId)}`,
      message: `富文本文件${exists ? '更新' : '创建'}成功: ${filename}\n访问地址: ${getPublicUrl(absolutePath, sessionId)}\n完整地址: ${CONFIG.baseUrl}${getPublicUrl(absolutePath, sessionId)}\n文件将以格式化样式展示，支持打印`
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      path: filePath
    };
  }
}

/**
 * 格式化文件大小
 * @param {number} bytes - 字节数
 * @returns {string}
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + units[i];
}

/**
 * 生成树形结构视图
 * @param {Array} items - 目录项数组
 * @param {string} rootPath - 根路径显示名称
 * @returns {string} - 树形字符串
 */
function generateTreeView(items, rootPath = '/') {
  const lines = [rootPath || '/'];
  
  function buildTree(nodes, prefix = '', isLast = []) {
    nodes.forEach((node, index) => {
      const isLastItem = index === nodes.length - 1;
      const currentPrefix = isLast.map(last => last ? '    ' : '│   ').join('');
      const connector = isLastItem ? '└── ' : '├── ';
      const icon = node.type === 'directory' ? '📁' : getFileIcon(node.name);
      
      lines.push(`${currentPrefix}${connector}${icon} ${node.name}${node.type === 'file' && node.formattedSize ? ` (${node.formattedSize})` : ''}`);
      
      if (node.children && node.children.length > 0) {
        buildTree(node.children, '', [...isLast, isLastItem]);
      }
    });
  }
  
  buildTree(items);
  return lines.join('\n');
}

/**
 * 根据文件名获取图标
 * @param {string} filename - 文件名
 * @returns {string} - 图标
 */
function getFileIcon(filename) {
  const ext = path.extname(filename).toLowerCase();
  const iconMap = {
    '.html': '🌐',
    '.htm': '🌐',
    '.js': '📜',
    '.ts': '📘',
    '.json': '📋',
    '.md': '📝',
    '.txt': '📄',
    '.css': '🎨',
    '.scss': '🎨',
    '.less': '🎨',
    '.jpg': '🖼️',
    '.jpeg': '🖼️',
    '.png': '🖼️',
    '.gif': '🖼️',
    '.svg': '🖼️',
    '.pdf': '📕',
    '.doc': '📘',
    '.docx': '📘',
    '.xls': '📗',
    '.xlsx': '📗',
    '.csv': '📊',
    '.zip': '📦',
    '.tar': '📦',
    '.gz': '📦',
    '.mp4': '🎬',
    '.mp3': '🎵',
    '.wav': '🎵',
  };
  return iconMap[ext] || '📄';
}

/**
 * 初始化workspace目录
 * @returns {Promise<Object>}
 */
export async function initWorkspace() {
  try {
    await fs.mkdir(WORKSPACE_ROOT, { recursive: true });
    
    // 创建.gitignore防止敏感文件被提交
    const gitignorePath = path.join(WORKSPACE_ROOT, '.gitignore');
    const gitignoreExists = await fs.stat(gitignorePath).catch(() => null);
    
    if (!gitignoreExists) {
      await fs.writeFile(gitignorePath, '# Workspace files\n*\n!.gitignore\n');
    }
    
    return {
      success: true,
      path: WORKSPACE_ROOT,
      message: 'Workspace目录初始化完成'
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// 导出配置常量
export const FILE_MANAGER_CONFIG = {
  WORKSPACE_ROOT,
  ALLOWED_EXTENSIONS: Array.from(ALLOWED_EXTENSIONS),
  MAX_FILE_SIZE,
  MAX_FILES_IN_DIR,
  MAX_FILES_PER_USER
};
