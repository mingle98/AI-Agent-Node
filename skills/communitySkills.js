import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CONFIG } from '../config.js';
import { getUserWorkspaceRoot } from '../tools/fileManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '..');
const DEFAULT_COMMUNITY_SKILLS_DIR = path.resolve(__dirname, '../skillMds');
const COMMUNITY_SKILL_AUTO_INSTALL_PYTHON_DEPS = process.env.COMMUNITY_SKILL_AUTO_INSTALL_PYTHON_DEPS !== 'false';
const COMMUNITY_SKILL_AUTO_INSTALL_NODE_DEPS = process.env.COMMUNITY_SKILL_AUTO_INSTALL_NODE_DEPS !== 'false';
const COMMUNITY_SKILL_PYTHON_VENV_ENABLED = process.env.COMMUNITY_SKILL_PYTHON_VENV_ENABLED === 'true';

function sanitizeSkillName(name = '') {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^[-_]+|[-_]+$/g, '');
}

function parseFrontmatter(markdown = '') {
  const content = String(markdown || '');
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!match) return { metadata: {}, body: content.trim(), frontmatterText: '' };

  const [, yamlText, body] = match;
  const metadata = {};
  let currentKey = '';
  let currentNestedKey = '';

  for (const rawLine of yamlText.split(/\r?\n/)) {
    const line = rawLine.replace(/\t/g, '    ');
    const topLevelMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (topLevelMatch) {
      currentKey = topLevelMatch[1].trim();
      currentNestedKey = '';
      const rawValue = topLevelMatch[2].trim();
      metadata[currentKey] = rawValue ? rawValue.replace(/^['"]|['"]$/g, '') : metadata[currentKey] || {};
      continue;
    }

    const nestedKeyMatch = line.match(/^\s{2,}([A-Za-z0-9_-]+):\s*(.*)$/);
    if (nestedKeyMatch && currentKey) {
      if (!metadata[currentKey] || typeof metadata[currentKey] !== 'object' || Array.isArray(metadata[currentKey])) {
        metadata[currentKey] = {};
      }
      currentNestedKey = nestedKeyMatch[1].trim();
      const rawValue = nestedKeyMatch[2].trim();
      metadata[currentKey][currentNestedKey] = rawValue ? rawValue.replace(/^['"]|['"]$/g, '') : metadata[currentKey][currentNestedKey] || [];
      continue;
    }

    const listMatch = line.match(/^\s*-[ ]+(.*)$/);
    if (listMatch && currentKey) {
      const item = listMatch[1].trim().replace(/^['"]|['"]$/g, '');
      if (currentNestedKey) {
        if (!Array.isArray(metadata[currentKey][currentNestedKey])) metadata[currentKey][currentNestedKey] = [];
        metadata[currentKey][currentNestedKey].push(item);
      } else {
        if (!Array.isArray(metadata[currentKey])) metadata[currentKey] = [];
        metadata[currentKey].push(item);
      }
    }
  }
  return { metadata, body: String(body || '').trim(), frontmatterText: yamlText.trim() };
}

function collectMarkdownFiles(dirPath, isRoot = true) {
  if (!fs.existsSync(dirPath)) {
    console.log(`[community-skills] 目录不存在，跳过扫描: ${dirPath}`);
    return [];
  }
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectMarkdownFiles(fullPath, false));
      continue;
    }
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.md')) continue;

    const lowerName = entry.name.toLowerCase();
    if (lowerName === 'skill.md') {
      files.push(fullPath);
      continue;
    }
    if (isRoot) {
      files.push(fullPath);
    }
  }
  return files;
}

function collectFilesRecursive(dirPath, ignoreNames = []) {
  if (!fs.existsSync(dirPath)) return [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = [];
  const ignoredDirectoryNames = new Set(['node_modules', '.community-venv', '__pycache__', '.git']);
  for (const entry of entries) {
    if (ignoreNames.includes(entry.name) || ignoredDirectoryNames.has(entry.name)) continue;
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) files.push(...collectFilesRecursive(fullPath, ignoreNames));
    else if (entry.isFile()) files.push(fullPath);
  }
  return files;
}

function classifyResource(relativePath) {
  const normalized = relativePath.split(path.sep).join('/');
  const ext = path.extname(normalized).toLowerCase();
  if (normalized.startsWith('scripts/')) return 'script';
  if (normalized.startsWith('references/')) return 'reference';
  if (normalized.startsWith('assets/')) return 'asset';
  if (ext === '.md') return 'reference';
  if (['.json', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.py', '.js', '.mjs', '.sh', '.pptx'].includes(ext)) return 'asset';
  return 'file';
}

function readJsonIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.warn(`[community-skills] manifest 解析失败: ${filePath}, error=${error.message}`);
    return null;
  }
}

function readTextIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return '';
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function parseRequirementsTxt(content = '') {
  return String(content || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

function uniqueStrings(items = []) {
  return [...new Set(items.map((item) => String(item || '').trim()).filter(Boolean))];
}

function extractKeywordsFromSkill(skillRoot, metadata = {}, body = '', scripts = [], assets = []) {
  const text = [metadata.name, metadata.description, body].filter(Boolean).join('\n');
  const matches = text.match(/[A-Za-z0-9.+#_-]{3,}|[\u4e00-\u9fff]{2,}/g) || [];
  const baseKeywords = matches
    .map((item) => item.trim())
    .filter((item) => !/^step|skill|json|python$/i.test(item))
    .filter((item) => item.length <= 32);

  const extras = [];
  if (/pptx/i.test(text)) extras.push('pptx', 'generate pptx');
  if (/powerpoint|presentation|slides/i.test(text)) extras.push('powerpoint', 'presentation', 'slides');
  if (/生成.*PPT|PPTX|演示文稿|幻灯片/.test(text)) extras.push('生成PPT', '生成PPTX', '演示文稿', '幻灯片');
  if (scripts.includes('scripts/pptx_builder.py')) extras.push('json to pptx');
  if (assets.includes('assets/styles/modern.json')) extras.push('modern style');

  const dependencyKeywords = Array.isArray(metadata?.dependency?.python)
    ? metadata.dependency.python.map((item) => String(item).split(/[<>=]/)[0].trim())
    : [];

  return uniqueStrings([metadata.name, ...baseKeywords, ...extras, ...dependencyKeywords]).slice(0, 24);
}

function inferPythonDependenciesFromScripts(skillRoot, scripts = [], metadata = {}) {
  const dependencyMap = {
    pptx: { package: 'python-pptx>=1.0.2', importName: 'pptx' },
    PIL: { package: 'pillow>=9.0.0', importName: 'PIL' },
    openpyxl: { package: 'openpyxl>=3.1.0', importName: 'openpyxl' },
    yaml: { package: 'pyyaml>=6.0.0', importName: 'yaml' },
    pandas: { package: 'pandas>=2.0.0', importName: 'pandas' },
    numpy: { package: 'numpy>=1.24.0', importName: 'numpy' },
    requests: { package: 'requests>=2.31.0', importName: 'requests' },
  };

  const inferred = [];
  for (const relPath of scripts.filter((file) => file.endsWith('.py'))) {
    const absPath = path.join(skillRoot, relPath);
    const content = readTextIfExists(absPath);
    const importMatches = [
      ...(content.matchAll(/^\s*import\s+([A-Za-z0-9_., ]+)/gm)),
      ...(content.matchAll(/^\s*from\s+([A-Za-z0-9_.]+)\s+import\s+/gm)),
    ];

    for (const match of importMatches) {
      const raw = match[1] || '';
      const modules = raw.split(',').map((item) => item.trim().split('.')[0]).filter(Boolean);
      for (const moduleName of modules) {
        if (dependencyMap[moduleName]) inferred.push(dependencyMap[moduleName]);
      }
    }
  }

  const frontmatterDeps = Array.isArray(metadata?.dependency?.python)
    ? metadata.dependency.python.map((item) => {
        const packageName = String(item || '').trim();
        const bareName = packageName.split(/[<>=]/)[0].trim();
        const mapped = Object.values(dependencyMap).find((dep) => dep.package.split(/[<>=]/)[0] === bareName);
        return mapped || { package: packageName, importName: '' };
      })
    : [];

  return uniqueStrings([...inferred.map((item) => JSON.stringify(item)), ...frontmatterDeps.map((item) => JSON.stringify(item))]).map((item) => JSON.parse(item));
}

function inferRuntimeFromResources(skillRoot, resources = [], scripts = []) {
  const resourcePaths = resources.map((item) => item.path);
  if (fs.existsSync(path.join(skillRoot, 'package.json')) || scripts.some((file) => /\.(mjs|cjs|js|ts)$/i.test(file))) {
    return 'node';
  }
  if (fs.existsSync(path.join(skillRoot, 'requirements.txt')) || scripts.some((file) => /\.py$/i.test(file))) {
    return 'python';
  }
  if (scripts.some((file) => /\.(sh|bash)$/i.test(file))) {
    return 'shell';
  }
  if (resourcePaths.includes('manifest.json')) {
    return 'unknown';
  }
  return '';
}

function inferEntryForRuntime(runtime, scripts = [], skillRoot) {
  const priorityMap = {
    python: ['scripts/main.py', 'scripts/run.py', 'main.py', 'run.py'],
    node: ['scripts/index.js', 'scripts/main.js', 'index.js', 'main.js', 'scripts/index.mjs', 'scripts/main.mjs'],
    shell: ['scripts/run.sh', 'run.sh', 'scripts/main.sh', 'main.sh'],
  };

  const packageJson = readJsonIfExists(path.join(skillRoot, 'package.json'));
  if (runtime === 'node' && packageJson?.main) {
    return packageJson.main;
  }

  const priorities = priorityMap[runtime] || [];
  for (const candidate of priorities) {
    if (scripts.includes(candidate) || fs.existsSync(path.join(skillRoot, candidate))) {
      return candidate;
    }
  }

  if (runtime === 'python') {
    return scripts.find((file) => /builder|generator|main|run/i.test(file) && file.endsWith('.py')) || scripts.find((file) => file.endsWith('.py')) || '';
  }
  if (runtime === 'node') {
    return scripts.find((file) => /index|main|run/i.test(file) && /\.(mjs|cjs|js|ts)$/i.test(file)) || scripts.find((file) => /\.(mjs|cjs|js|ts)$/i.test(file)) || '';
  }
  if (runtime === 'shell') {
    return scripts.find((file) => /run|main/i.test(file) && /\.(sh|bash)$/i.test(file)) || scripts.find((file) => /\.(sh|bash)$/i.test(file)) || '';
  }

  return '';
}

function inferNodeDependenciesFromPackageJson(skillRoot) {
  const packageJson = readJsonIfExists(path.join(skillRoot, 'package.json'));
  const deps = packageJson && typeof packageJson === 'object'
    ? {
        ...(packageJson.dependencies || {}),
        ...(packageJson.optionalDependencies || {}),
      }
    : {};

  return Object.keys(deps)
    .map((name) => String(name || '').trim())
    .filter(Boolean);
}

function buildInferredManifest(skillRoot, resources, scripts, assets, metadata = {}, body = '') {
  const runtime = inferRuntimeFromResources(skillRoot, resources, scripts);
  const inferredKeywords = extractKeywordsFromSkill(skillRoot, metadata, body, scripts, assets);

  const inferred = {
    inferred: true,
    runtime,
    entry: '',
    workingDirectory: '.',
    keywords: inferredKeywords,
    dependencies: {},
    commands: {},
    defaults: {},
  };

  if (!runtime || runtime === 'unknown') {
    inferred.kind = 'resource';
    return inferred;
  }

  const entry = inferEntryForRuntime(runtime, scripts, skillRoot);
  inferred.entry = entry;
  const requirements = runtime === 'python'
    ? parseRequirementsTxt(readTextIfExists(path.join(skillRoot, 'requirements.txt')))
    : [];
  const nodeDependencies = runtime === 'node' ? inferNodeDependenciesFromPackageJson(skillRoot) : [];
  const defaultStyle = assets.includes('assets/styles/modern.json') ? 'assets/styles/modern.json' : '';

  if (runtime === 'python') {
    const requirementDeps = requirements.map((pkg) => ({ package: pkg, importName: '' }));
    const importDeps = inferPythonDependenciesFromScripts(skillRoot, scripts, metadata);
    inferred.dependencies.python = importDeps.length > 0 ? importDeps : requirementDeps;
    if (scripts.includes('scripts/json_validator.py')) {
      inferred.commands.validateInput = ['scripts/json_validator.py', '--input', '{input}'];
    }
    if (entry) {
      inferred.commands.build = [entry, '--input', '{input}', '--output', '{output}'];
      if (defaultStyle && (entry.includes('builder') || entry.includes('pptx') || entry.includes('generator'))) {
        inferred.commands.build.push('--style', '{style}');
      }
    }
    if (scripts.includes('scripts/pptx_validator.py')) {
      inferred.commands.validateOutput = ['scripts/pptx_validator.py', '--input', '{output}'];
    }
    if (defaultStyle) inferred.defaults.style = defaultStyle;
    inferred.defaults.output = 'presentation.pptx';
    inferred.dependencies.python = inferred.dependencies.python.length > 0 ? inferred.dependencies.python : [];
  } else if (runtime === 'node' && entry) {
    inferred.dependencies.node = nodeDependencies;
    if (entry.includes('qr_generator.mjs')) {
      inferred.input = {
        mode: 'raw',
        description: '二维码承载内容，可直接传 URL 或文本',
      };
      inferred.commands.build = [entry, '--data', '{input}', '--output', '{output}', '{options}'];
      inferred.defaults.output = 'qr-code.png';
    } else {
      inferred.commands.build = [entry, '{input}', '{output}'];
    }
    inferred.dependencies.node = inferred.dependencies.node.length > 0 ? inferred.dependencies.node : [];
  } else if (runtime === 'shell' && entry) {
    inferred.commands.build = [entry, '{input}', '{output}'];
  }

  return inferred;
}

function buildSuggestedCommandsFromManifest(manifest, scripts = []) {
  const runtime = manifest?.runtime || 'command';
  const commands = [];
  if (manifest?.commands?.validateInput?.length) {
    commands.push(`${runtime} ${manifest.commands.validateInput.join(' ')}`);
  }
  if (manifest?.commands?.build?.length) {
    commands.push(`${runtime} ${manifest.commands.build.join(' ')}`);
  }
  if (manifest?.commands?.validateOutput?.length) {
    commands.push(`${runtime} ${manifest.commands.validateOutput.join(' ')}`);
  }
  if (!commands.length) {
    if (scripts.includes('scripts/json_validator.py')) commands.push('python scripts/json_validator.py --input ./ppt_data.json');
    if (scripts.includes('scripts/pptx_builder.py')) commands.push('python scripts/pptx_builder.py --input ./ppt_data.json --style assets/styles/modern.json --output ./presentation.pptx');
  }
  return commands;
}

function detectCommand(candidates = [], probeArgs = ['--version'], cwd = WORKSPACE_ROOT, requestedCommand = '') {
  for (const candidate of candidates) {
    const result = spawnSync(candidate, probeArgs, { cwd, encoding: 'utf8', timeout: 120000 });
    if (result.error?.code === 'ENOENT') continue;
    return {
      requestedCommand: requestedCommand || candidate,
      command: candidate,
      executable: (result.stdout || result.stderr || '').trim(),
      cwd,
      status: result.status,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      error: result.error ? result.error.message : '',
    };
  }
  return { requestedCommand: requestedCommand || String(candidates[0] || ''), command: '', executable: '', cwd, status: null, stdout: '', stderr: '', error: `Command not found: ${requestedCommand || candidates.join('/')}` };
}

function detectPythonCommand(cwd = WORKSPACE_ROOT) {
  return detectCommand(['python3', 'python'], ['-c', 'import sys; print(sys.executable)'], cwd, 'python');
}

function detectNodeCommand(cwd = WORKSPACE_ROOT) {
  return detectCommand(['node'], ['-e', 'console.log(process.execPath)'], cwd, 'node');
}

function runCommand(command, args, cwd, options = {}) {
  const { resolvedCommand = '' } = options;
  const candidates = resolvedCommand ? [resolvedCommand] : (command === 'python' ? ['python3', 'python'] : [command]);
  for (const candidate of candidates) {
    const result = spawnSync(candidate, args, { cwd, encoding: 'utf8', timeout: 120000 });
    if (result.error?.code === 'ENOENT') continue;
    return {
      requestedCommand: command,
      command: candidate,
      args,
      cwd,
      status: result.status,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      error: result.error ? result.error.message : '',
    };
  }
  return { requestedCommand: command, command: resolvedCommand || command, args, cwd, status: null, stdout: '', stderr: '', error: `Command not found: ${command}` };
}

function checkPythonDependencies(pythonDeps = [], pythonCommand = '') {
  const results = [];
  for (const dep of pythonDeps) {
    const importName = dep?.importName;
    const packageName = dep?.package;
    if (!importName) {
      results.push({ package: packageName || '', importName: '', ok: true, skipped: true, stderr: '', stdout: '', error: '', command: pythonCommand });
      continue;
    }
    const probe = runCommand('python', ['-c', `import ${importName}`], WORKSPACE_ROOT, { resolvedCommand: pythonCommand });
    results.push({
      package: packageName || importName,
      importName,
      ok: probe.status === 0 && !probe.error,
      stderr: probe.stderr || '',
      stdout: probe.stdout || '',
      error: probe.error || '',
      command: probe.command || pythonCommand,
    });
  }
  return results;
}

function installPythonDependencies(packages = [], pythonCommand = '', cwd = WORKSPACE_ROOT) {
  const dedupedPackages = [...new Set((packages || []).filter(Boolean))];
  if (!dedupedPackages.length) {
    return { attempted: false, installed: false, packages: [], commandResult: null };
  }
  const shouldBootstrapPip = String(pythonCommand || '').includes('.community-venv');
  const bootstrapResult = shouldBootstrapPip
    ? runCommand('python', ['-m', 'pip', 'install', '--upgrade', 'pip', 'setuptools', 'wheel'], cwd, { resolvedCommand: pythonCommand })
    : null;
  const commandResult = runCommand('python', ['-m', 'pip', 'install', ...dedupedPackages], cwd, { resolvedCommand: pythonCommand });
  return { attempted: true, installed: commandResult.status === 0 && !commandResult.error, packages: dedupedPackages, bootstrapResult, commandResult };
}

function resolvePythonBinaryFromVenv(venvDir) {
  if (!venvDir) return '';
  const unixPath = path.join(venvDir, 'bin', 'python');
  const windowsPath = path.join(venvDir, 'Scripts', 'python.exe');
  if (fs.existsSync(unixPath)) return unixPath;
  if (fs.existsSync(windowsPath)) return windowsPath;
  return '';
}

function ensurePythonVenv(skillRoot, runtimeOptions = {}) {
  const useVenv = Boolean(runtimeOptions?.useVenv);
  if (!useVenv) return { enabled: false, created: false, venvDir: '', pythonCommand: '' };

  const venvPath = String(runtimeOptions?.venvPath || '.community-venv').trim() || '.community-venv';
  const venvDir = path.isAbsolute(venvPath) ? venvPath : path.join(skillRoot, venvPath);
  const existingPython = resolvePythonBinaryFromVenv(venvDir);
  if (existingPython) {
    return { enabled: true, created: false, venvDir, pythonCommand: existingPython };
  }

  const basePython = String(runtimeOptions?.pythonCommand || 'python3').trim() || 'python3';
  const createResult = runCommand(basePython, ['-m', 'venv', venvDir], skillRoot, { resolvedCommand: basePython });
  const pythonCommand = resolvePythonBinaryFromVenv(venvDir);
  return {
    enabled: true,
    created: createResult.status === 0 && !createResult.error && Boolean(pythonCommand),
    venvDir,
    pythonCommand,
    commandResult: createResult,
  };
}

function detectNodePackageManager(skillRoot, runtimeOptions = {}) {
  const preferred = String(runtimeOptions?.packageManager || '').trim();
  const candidates = preferred ? [preferred] : ['npm', 'pnpm', 'yarn'];
  for (const candidate of candidates) {
    const detected = detectCommand([candidate], ['--version'], skillRoot, candidate);
    if (detected.command) return detected.command;
  }
  return 'npm';
}

function installNodeProjectDependencies(skillRoot, packageManager = 'npm') {
  const packageJsonPath = path.join(skillRoot, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return { attempted: false, installed: false, commandResult: null, installer: packageManager, mode: 'project' };
  }
  const args = packageManager === 'npm'
    ? ['install', '--cache', path.join(skillRoot, '.npm-cache'), '--no-audit', '--no-fund']
    : ['install'];
  const commandResult = runCommand(packageManager, args, skillRoot, { resolvedCommand: packageManager });
  return {
    attempted: true,
    installed: commandResult.status === 0 && !commandResult.error,
    packages: [],
    commandResult,
    installer: packageManager,
    mode: 'project',
  };
}

function installNodeDependencies(packages = [], cwd = WORKSPACE_ROOT, options = {}) {
  const dedupedPackages = [...new Set((packages || []).filter(Boolean))];
  const installer = String(options?.installer || 'npm').trim() || 'npm';
  const strategy = String(options?.strategy || 'packages').trim() || 'packages';

  if (strategy === 'project') {
    return installNodeProjectDependencies(cwd, installer);
  }

  if (!dedupedPackages.length) {
    return { attempted: false, installed: false, packages: [], commandResult: null, installer, mode: 'packages' };
  }

  const args = installer === 'yarn'
    ? ['add', ...dedupedPackages]
    : installer === 'npm'
      ? ['install', '--cache', path.join(cwd, '.npm-cache'), '--no-audit', '--no-fund', ...dedupedPackages]
      : ['install', ...dedupedPackages];
  const installResult = runCommand(installer, args, cwd, { resolvedCommand: installer });
  return {
    attempted: true,
    installed: installResult.status === 0 && !installResult.error,
    packages: dedupedPackages,
    commandResult: installResult,
    installer,
    mode: 'packages',
  };
}

function checkNodeDependencies(nodeDeps = [], skillRoot = WORKSPACE_ROOT) {
  const results = [];
  for (const dep of nodeDeps) {
    const packageName = typeof dep === 'string' ? dep : (dep?.package || dep?.importName || '');
    if (!packageName) continue;
    const packageJsonPath = path.join(skillRoot, 'node_modules', packageName, 'package.json');
    results.push({
      package: packageName,
      importName: packageName,
      ok: fs.existsSync(packageJsonPath),
      stderr: '',
      stdout: '',
      error: '',
      command: 'node',
    });
  }
  return results;
}

function summarizeDependencyInstallResult(runtimeLabel, dependencyInstall, runtimeInfo, missingDependencies = []) {
  if (!missingDependencies.length) return '';
  const packageList = missingDependencies.map((item) => item.package).join(', ');
  const interpreter = runtimeInfo?.command || runtimeLabel;

  if (!dependencyInstall?.attempted) {
    const installHint = runtimeLabel === 'python'
      ? `${interpreter} -m pip install ${packageList}`
      : runtimeLabel === 'node'
        ? `npm install ${packageList}`
        : `${interpreter} install ${packageList}`;
    return `检测到缺少 ${runtimeLabel.toUpperCase()} 依赖：${packageList}。当前未自动安装，请手动执行 ${installHint}`;
  }

  if (dependencyInstall.installed) {
    return `已自动尝试安装缺失依赖并完成复检，但仍存在未满足依赖：${packageList}。请检查当前 ${runtimeLabel.toUpperCase()} 环境或安装日志。`;
  }

  const stderr = String(dependencyInstall.commandResult?.stderr || dependencyInstall.commandResult?.error || '').trim();
  const shortReason = stderr.split(/\r?\n/).filter(Boolean).slice(-1)[0] || '安装命令执行失败';
  return `检测到缺少 ${runtimeLabel.toUpperCase()} 依赖：${packageList}。系统已自动尝试安装，但未成功：${shortReason}`;
}

function createPythonRuntimeHandler() {
  return {
    runtime: 'python',
    detect(skillRoot, manifest = {}) {
      const runtimeOptions = manifest?.runtimeOptions?.python || {};
      const venv = ensurePythonVenv(skillRoot, runtimeOptions);
      if (venv.enabled && venv.commandResult && (venv.commandResult.status !== 0 || venv.commandResult.error)) {
        return {
          requestedCommand: 'python',
          command: '',
          executable: '',
          cwd: skillRoot,
          status: venv.commandResult.status,
          stdout: venv.commandResult.stdout || '',
          stderr: venv.commandResult.stderr || '',
          error: venv.commandResult.error || 'venv-create-failed',
          venv,
        };
      }
      if (venv.enabled && venv.pythonCommand) {
        return {
          requestedCommand: 'python',
          command: venv.pythonCommand,
          executable: venv.pythonCommand,
          cwd: skillRoot,
          status: 0,
          stdout: venv.pythonCommand,
          stderr: '',
          error: '',
          venv,
        };
      }
      const detected = detectPythonCommand(skillRoot);
      return { ...detected, venv };
    },
    checkDependencies(manifest, runtimeInfo) {
      return checkPythonDependencies(manifest?.dependencies?.python || [], runtimeInfo?.command || '');
    },
    maybeInstallDependencies(missingDependencies, runtimeInfo, skillRoot, manifest = {}) {
      const installConfig = manifest?.install?.python || {};
      if (!missingDependencies.length || !COMMUNITY_SKILL_AUTO_INSTALL_PYTHON_DEPS || installConfig.enabled === false) return null;
      return installPythonDependencies(missingDependencies.map((item) => item.package), runtimeInfo?.command || '', skillRoot);
    },
    summarizeMissingDependencies(dependencyInstall, runtimeInfo, missingDependencies) {
      return summarizeDependencyInstallResult('python', dependencyInstall, runtimeInfo, missingDependencies);
    },
    resolveCommand(commandName, runtimeInfo) {
      return commandName === 'python' ? runtimeInfo?.command || '' : '';
    },
  };
}

function createNodeRuntimeHandler() {
  return {
    runtime: 'node',
    detect(skillRoot, manifest = {}) {
      const detected = detectNodeCommand(skillRoot);
      const packageManager = detectNodePackageManager(skillRoot, manifest?.runtimeOptions?.node || {});
      return { ...detected, packageManager };
    },
    checkDependencies(manifest, runtimeInfo, skillRoot) {
      return checkNodeDependencies(manifest?.dependencies?.node || [], skillRoot).map((item) => ({ ...item, command: runtimeInfo?.command || 'node' }));
    },
    maybeInstallDependencies(missingDependencies, runtimeInfo, skillRoot, manifest = {}) {
      const installConfig = manifest?.install?.node || {};
      if (!COMMUNITY_SKILL_AUTO_INSTALL_NODE_DEPS || installConfig.enabled === false) return null;
      const strategy = installConfig.strategy || (fs.existsSync(path.join(skillRoot, 'package.json')) ? 'project' : 'packages');
      return installNodeDependencies(missingDependencies.map((item) => item.package), skillRoot, {
        installer: installConfig.installer || runtimeInfo?.packageManager || 'npm',
        strategy,
      });
    },
    summarizeMissingDependencies(dependencyInstall, runtimeInfo, missingDependencies) {
      return summarizeDependencyInstallResult('node', dependencyInstall, runtimeInfo, missingDependencies);
    },
    resolveCommand(commandName, runtimeInfo) {
      return commandName === 'node' ? runtimeInfo?.command || '' : '';
    },
  };
}

function createShellRuntimeHandler() {
  return {
    runtime: 'shell',
    detect() {
      return { requestedCommand: 'sh', command: 'sh', executable: 'sh', cwd: WORKSPACE_ROOT, status: 0, stdout: '', stderr: '', error: '' };
    },
    checkDependencies() {
      return [];
    },
    maybeInstallDependencies() {
      return null;
    },
    summarizeMissingDependencies(_dependencyInstall, _runtimeInfo, missingDependencies) {
      const packageList = missingDependencies.map((item) => item.package).join(', ');
      return packageList ? `检测到缺少 SHELL 运行依赖：${packageList}。当前 runtime handler 不支持自动安装。` : '';
    },
    resolveCommand(commandName) {
      return commandName === 'shell' ? 'sh' : '';
    },
  };
}

const RUNTIME_HANDLERS = {
  python: createPythonRuntimeHandler(),
  node: createNodeRuntimeHandler(),
  shell: createShellRuntimeHandler(),
};

function getRuntimeHandler(runtime = '') {
  return RUNTIME_HANDLERS[String(runtime || '').trim()] || null;
}
function fillCommandArgs(template = [], replacements = {}) {
  const args = [];
  for (let i = 0; i < template.length; i += 1) {
    const item = template[i];
    if (typeof item !== 'string') continue;
    const next = template[i + 1];
    const nextPlaceholder = typeof next === 'string' ? next.match(/^\{(.+)\}$/) : null;
    if (item.startsWith('--') && nextPlaceholder && !replacements[nextPlaceholder[1]]) {
      i += 1;
      continue;
    }
    const placeholderMatch = item.match(/^\{(.+)\}$/);
    if (placeholderMatch) {
      const value = replacements[placeholderMatch[1]];
      if (value) {
        if (Array.isArray(value)) args.push(...value.map((part) => String(part)));
        else args.push(String(value));
      }
      continue;
    }
    args.push(item);
  }
  return args;
}

function normalizeManifest(manifest = {}) {
  const normalized = { ...manifest };
  normalized.runtimeOptions = normalized.runtimeOptions && typeof normalized.runtimeOptions === 'object' ? { ...normalized.runtimeOptions } : {};
  normalized.install = normalized.install && typeof normalized.install === 'object' ? { ...normalized.install } : {};
  normalized.dependencies = normalized.dependencies && typeof normalized.dependencies === 'object' ? { ...normalized.dependencies } : {};

  if (!normalized.install.python && Array.isArray(normalized.dependencies.python) && normalized.dependencies.python.length > 0) {
    normalized.install.python = {
      enabled: true,
      installer: 'pip',
      strategy: 'packages',
    };
  }

  if (!normalized.install.node) {
    normalized.install.node = {
      enabled: true,
      installer: 'npm',
      strategy: fs.existsSync(path.join(WORKSPACE_ROOT, 'package.json')) ? 'project' : 'packages',
    };
  }

  if (normalized.runtime === 'python') {
    normalized.runtimeOptions.python = {
      useVenv: COMMUNITY_SKILL_PYTHON_VENV_ENABLED,
      venvPath: '.community-venv',
      pythonCommand: 'python3',
      ...(normalized.runtimeOptions.python || {}),
    };
  }

  if (normalized.runtime === 'node') {
    normalized.runtimeOptions.node = {
      packageManager: 'npm',
      installMode: 'auto',
      ...(normalized.runtimeOptions.node || {}),
    };
  }

  return normalized;
}

function splitCommandOptions(input = '') {
  const text = String(input || '').trim();
  if (!text) return [];
  const matches = text.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
  return matches.map((item) => item.replace(/^['"]|['"]$/g, ''));
}

function mergeManifestWithInferred(explicitManifest, inferredManifest) {
  if (!explicitManifest) return normalizeManifest(inferredManifest || {});
  if (!inferredManifest) return normalizeManifest(explicitManifest || {});

  const explicitPythonDeps = Array.isArray(explicitManifest?.dependencies?.python)
    ? explicitManifest.dependencies.python.filter((item) => item && (item.package || item.importName))
    : [];
  const inferredPythonDeps = Array.isArray(inferredManifest?.dependencies?.python)
    ? inferredManifest.dependencies.python
    : [];
  const explicitNodeDeps = Array.isArray(explicitManifest?.dependencies?.node)
    ? explicitManifest.dependencies.node.filter(Boolean)
    : [];
  const inferredNodeDeps = Array.isArray(inferredManifest?.dependencies?.node)
    ? inferredManifest.dependencies.node.filter(Boolean)
    : [];

  return normalizeManifest({
    ...inferredManifest,
    ...explicitManifest,
    keywords: Array.isArray(explicitManifest.keywords) && explicitManifest.keywords.length > 0
      ? uniqueStrings(explicitManifest.keywords)
      : uniqueStrings(inferredManifest.keywords || []),
    dependencies: {
      ...(inferredManifest.dependencies || {}),
      ...(explicitManifest.dependencies || {}),
      python: explicitPythonDeps.length > 0 ? explicitPythonDeps : inferredPythonDeps,
      node: explicitNodeDeps.length > 0 ? uniqueStrings(explicitNodeDeps) : uniqueStrings(inferredNodeDeps),
    },
    commands: {
      ...(inferredManifest.commands || {}),
      ...(explicitManifest.commands || {}),
    },
    defaults: {
      ...(inferredManifest.defaults || {}),
      ...(explicitManifest.defaults || {}),
    },
    input: explicitManifest.input && typeof explicitManifest.input === 'object'
      ? { ...(inferredManifest.input || {}), ...explicitManifest.input }
      : (inferredManifest.input || undefined),
  });
}

function buildSkillBundleInfo(skillFilePath, metadata = {}, body = '') {
  if (path.basename(skillFilePath).toLowerCase() !== 'skill.md') return null;
  const skillRoot = path.dirname(skillFilePath);
  const bundleFiles = collectFilesRecursive(skillRoot, ['SKILL.md']);
  const resources = bundleFiles.map((filePath) => {
    const rel = path.relative(skillRoot, filePath);
    return { path: rel, type: classifyResource(rel) };
  });
  const pick = (type) => resources.filter((item) => item.type === type).map((item) => item.path).sort();
  const scripts = pick('script');
  const references = pick('reference');
  const assets = pick('asset');
  const files = pick('file');
  const manifestPath = path.join(skillRoot, 'manifest.json');
  const explicitManifest = readJsonIfExists(manifestPath);
  const inferredManifest = buildInferredManifest(skillRoot, resources, scripts, assets, metadata, body);
  const manifest = mergeManifestWithInferred(explicitManifest, inferredManifest);
  const capabilities = [];
  if (scripts.includes('scripts/json_validator.py')) capabilities.push('json-validation');
  if (scripts.includes('scripts/pptx_builder.py')) capabilities.push('pptx-build');
  if (scripts.includes('scripts/pptx_validator.py')) capabilities.push('pptx-validation');
  if (manifest?.runtime) capabilities.push(`runtime:${manifest.runtime}`);
  if (manifest?.entry) capabilities.push(`entry:${manifest.entry}`);
  const suggestedCommands = buildSuggestedCommandsFromManifest(manifest, scripts);
  if (scripts.includes('scripts/pptx_validator.py') && !suggestedCommands.some((cmd) => cmd.includes('pptx_validator.py'))) {
    suggestedCommands.push('python scripts/pptx_validator.py --input ./presentation.pptx');
  }
  return {
    kind: 'bundle',
    rootDir: skillRoot,
    relativeRoot: path.relative(WORKSPACE_ROOT, skillRoot),
    resourceCount: resources.length,
    resources,
    scripts,
    references,
    assets,
    files,
    capabilities,
    manifest,
    manifestPath: explicitManifest && fs.existsSync(manifestPath) ? manifestPath : '',
    suggestedCommands,
  };
}

function getSessionWorkspaceRoot(sessionId = '') {
  try {
    return sessionId ? getUserWorkspaceRoot(sessionId) : '';
  } catch {
    return '';
  }
}

function resolveUserFilePath(maybePath, sessionId = '', fallback = '') {
  const raw = String(maybePath || fallback || '').trim();
  if (!raw) return '';
  if (path.isAbsolute(raw)) return raw;

  const sessionRoot = getSessionWorkspaceRoot(sessionId);
  if (sessionRoot) {
    const fromSessionWorkspace = path.resolve(sessionRoot, raw);
    if (fs.existsSync(fromSessionWorkspace)) return fromSessionWorkspace;
    return fromSessionWorkspace;
  }

  const fromWorkspace = path.resolve(WORKSPACE_ROOT, raw);
  if (fs.existsSync(fromWorkspace)) return fromWorkspace;
  return fromWorkspace;
}

function resolveSkillResourcePath(maybePath, skillRoot, fallback = '') {
  const raw = String(maybePath || fallback || '').trim();
  if (!raw) return '';
  if (path.isAbsolute(raw)) return raw;

  const fromSkillRoot = path.resolve(skillRoot, raw);
  if (fs.existsSync(fromSkillRoot)) return fromSkillRoot;

  const fromWorkspace = path.resolve(WORKSPACE_ROOT, raw);
  if (fs.existsSync(fromWorkspace)) return fromWorkspace;
  return fromSkillRoot;
}

function summarizeInstallResult(dependencyInstall, pythonRuntime, missingDependencies = []) {
  if (!missingDependencies.length) return '';
  const packageList = missingDependencies.map((item) => item.package).join(', ');
  const interpreter = pythonRuntime?.command || 'python';

  if (!dependencyInstall?.attempted) {
    return `检测到缺少 Python 依赖：${packageList}。当前未自动安装，请手动执行 ${interpreter} -m pip install ${packageList}`;
  }

  if (dependencyInstall.installed) {
    return `已自动尝试安装缺失依赖（${interpreter} -m pip install ...）并完成复检，但仍存在未满足依赖：${packageList}。请检查当前 Python 环境或安装日志。`;
  }

  const stderr = String(dependencyInstall.commandResult?.stderr || dependencyInstall.commandResult?.error || '').trim();
  const shortReason = stderr.split(/\r?\n/).filter(Boolean).slice(-1)[0] || '安装命令执行失败';
  return `检测到缺少 Python 依赖：${packageList}。系统已自动尝试安装（${interpreter} -m pip install ...），但未成功：${shortReason}`;
}

function buildBundleFailureMessage(failed) {
  const commandText = failed ? `${failed.command} ${failed.args.join(' ')}` : '';
  const stderr = String(failed?.stderr || failed?.error || '').trim();
  const shortReason = stderr.split(/\r?\n/).filter(Boolean).slice(-1)[0] || '';
  return shortReason
    ? `Bundle 执行失败：${shortReason}。失败命令: ${commandText}`
    : `Bundle 执行失败，失败命令: ${commandText}`;
}

function tryExecuteBundle(bundle, sessionId, inputPath, outputPath, stylePath) {
  const manifest = bundle?.manifest || {};
  const runtime = manifest.runtime || '';
  if (!bundle || !runtime || !manifest.commands?.build) return null;

  const runtimeHandler = getRuntimeHandler(runtime);
  if (!runtimeHandler) {
    return {
      mode: 'bundle-error',
      executed: false,
      reason: 'unsupported-runtime',
      message: `暂不支持的 runtime: ${runtime}`,
      bundle,
    };
  }

  const skillRoot = bundle.rootDir;
  const inputMode = manifest.input?.mode || manifest.defaults?.inputMode || 'file';
  const resolvedInputPath = inputMode === 'raw' ? String(inputPath || '') : resolveUserFilePath(inputPath, sessionId);
  const resolvedOutputPath = resolveUserFilePath(outputPath, sessionId, resolvedInputPath && inputMode !== 'raw' ? path.join(path.dirname(String(inputPath || resolvedInputPath)), `${path.parse(resolvedInputPath).name}.pptx`) : manifest.defaults?.output || 'presentation.pptx');
  const resolvedStylePath = resolveSkillResourcePath(stylePath, skillRoot, manifest.defaults?.style || (bundle.assets.includes('assets/styles/modern.json') ? 'assets/styles/modern.json' : ''));

  if (!resolvedInputPath) {
    return { mode: 'bundle-ready', executed: false, reason: 'missing-input-path', message: inputMode === 'raw' ? '检测到可执行 bundle，但未提供输入内容，因此暂不执行。' : '检测到可执行 bundle，但未提供输入文件路径，因此暂不执行。', bundle };
  }
  if (inputMode !== 'raw' && !fs.existsSync(resolvedInputPath)) {
    return { mode: 'bundle-error', executed: false, reason: 'input-not-found', message: `输入文件不存在: ${resolvedInputPath}`, bundle, resolvedInputPath };
  }

  const commandResults = [];
  const dependencyChecks = [];
  let dependencyInstall = null;
  const runtimeInfo = runtimeHandler.detect(skillRoot, manifest);

  if (!runtimeInfo?.command) {
    return {
      mode: 'bundle-error',
      executed: false,
      reason: `${runtime}-not-found`,
      message: `未找到可用的 ${runtime} 解释器/命令。`,
      bundle,
      resolvedInputPath,
      resolvedOutputPath,
      resolvedStylePath,
      runtimeInfo,
      pythonRuntime: runtime === 'python' ? runtimeInfo : null,
    };
  }

  let initialChecks = runtimeHandler.checkDependencies(manifest, runtimeInfo, skillRoot) || [];
  dependencyChecks.push(...initialChecks);
  let missingDependencies = initialChecks.filter((item) => !item.ok);

  if (missingDependencies.length > 0) {
    dependencyInstall = runtimeHandler.maybeInstallDependencies(missingDependencies, runtimeInfo, skillRoot, manifest);
    if (dependencyInstall?.commandResult) commandResults.push(dependencyInstall.commandResult);
    if (dependencyInstall?.attempted) {
      const postInstallChecks = runtimeHandler.checkDependencies(manifest, runtimeInfo, skillRoot) || [];
      dependencyChecks.push(...postInstallChecks.map((item) => ({ ...item, phase: 'post-install' })));
      missingDependencies = postInstallChecks.filter((item) => !item.ok);
    }
  }

  if (missingDependencies.length > 0) {
    return {
      mode: 'bundle-error',
      executed: false,
      reason: 'missing-dependencies',
      message: runtimeHandler.summarizeMissingDependencies(dependencyInstall, runtimeInfo, missingDependencies),
      bundle,
      resolvedInputPath,
      resolvedOutputPath,
      resolvedStylePath,
      dependencyChecks,
      dependencyInstall,
      runtimeInfo,
      pythonRuntime: runtime === 'python' ? runtimeInfo : null,
      commandResults,
    };
  }

  const replacements = { input: resolvedInputPath, output: resolvedOutputPath, style: resolvedStylePath, options: splitCommandOptions(stylePath) };
  const validateInputCmd = manifest.commands?.validateInput;
  const buildCmd = manifest.commands?.build;
  const validateOutputCmd = manifest.commands?.validateOutput;
  const commandName = runtime === 'python' ? 'python' : runtime === 'node' ? 'node' : runtime === 'shell' ? 'sh' : runtime;
  const resolvedCommand = runtimeHandler.resolveCommand(commandName, runtimeInfo);

  if (validateInputCmd?.length) {
    const result = runCommand(commandName, fillCommandArgs(validateInputCmd, replacements), skillRoot, { resolvedCommand });
    commandResults.push(result);
    if (result.status !== 0 || result.error) {
      return {
        mode: 'bundle-error',
        executed: false,
        bundle,
        resolvedInputPath,
        resolvedOutputPath,
        resolvedStylePath,
        dependencyChecks,
        dependencyInstall,
        runtimeInfo,
        pythonRuntime: runtime === 'python' ? runtimeInfo : null,
        commandResults,
        message: buildBundleFailureMessage(result),
      };
    }
  }

  if (buildCmd?.length) {
    const result = runCommand(commandName, fillCommandArgs(buildCmd, replacements), skillRoot, { resolvedCommand });
    commandResults.push(result);
    if (result.status !== 0 || result.error) {
      return {
        mode: 'bundle-error',
        executed: false,
        bundle,
        resolvedInputPath,
        resolvedOutputPath,
        resolvedStylePath,
        dependencyChecks,
        dependencyInstall,
        runtimeInfo,
        pythonRuntime: runtime === 'python' ? runtimeInfo : null,
        commandResults,
        message: buildBundleFailureMessage(result),
      };
    }
  }

  if (validateOutputCmd?.length) {
    const result = runCommand(commandName, fillCommandArgs(validateOutputCmd, replacements), skillRoot, { resolvedCommand });
    commandResults.push(result);
    if (result.status !== 0 || result.error) {
      return {
        mode: 'bundle-error',
        executed: false,
        bundle,
        resolvedInputPath,
        resolvedOutputPath,
        resolvedStylePath,
        dependencyChecks,
        dependencyInstall,
        runtimeInfo,
        pythonRuntime: runtime === 'python' ? runtimeInfo : null,
        commandResults,
        message: buildBundleFailureMessage(result),
      };
    }
  }

  return {
    mode: 'bundle-executed',
    executed: true,
    bundle,
    resolvedInputPath,
    resolvedOutputPath,
    resolvedStylePath,
    dependencyChecks,
    dependencyInstall,
    runtimeInfo,
    pythonRuntime: runtime === 'python' ? runtimeInfo : null,
    commandResults,
    message: `Bundle 执行成功，已生成文件: ${resolvedOutputPath}`,
  };
}

function buildParams(bundle) {
  if (bundle?.manifest?.entry?.includes('qr_generator.mjs')) {
    return [
      { name: '用户请求', type: 'string', example: '请生成二维码' },
      { name: '补充上下文', type: 'string', example: '品牌活动物料', required: false },
      { name: '二维码内容', type: 'string', example: 'https://example.com/campaign' },
      { name: '输出路径', type: 'string', example: 'output/campaign-qr.png', required: false },
      { name: '定制参数', type: 'string', example: '--size 1200 --foreground #111827 --background #ffffff --label 扫码了解详情', required: false },
    ];
  }

  if (!bundle?.capabilities?.includes('pptx-build')) {
    return [
      { name: '用户请求', type: 'string', example: '请按这个社区 skill 的规范帮我完成当前任务' },
      { name: '补充上下文', type: 'string', example: '当前仓库是一个 Node.js 项目', required: false },
    ];
  }
  return [
    { name: '用户请求', type: 'string', example: '请根据 JSON 生成 PPTX 文件' },
    { name: '补充上下文', type: 'string', example: '当前仓库是一个 Node.js 项目', required: false },
    { name: '输入 JSON 路径', type: 'string', example: 'data/ppt_data.json', required: false },
    { name: '输出 PPTX 路径', type: 'string', example: 'output/presentation.pptx', required: false },
    { name: '风格配置路径', type: 'string', example: 'assets/styles/modern.json', required: false },
  ];
}

function parseJsonObject(text = '') {
  try {
    const value = JSON.parse(String(text || '').trim());
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function buildQrOptionsFromContext(contextHint = '') {
  const parsed = parseJsonObject(contextHint);
  if (!parsed) return String(contextHint || '').trim();

  const optionMap = {
    format: '--format',
    size: '--size',
    margin: '--border',
    border: '--border',
    foreground: '--foreground',
    color: '--foreground',
    background: '--background',
    errorCorrectionLevel: '--error-correction',
    errorCorrection: '--error-correction',
    logo: '--logo',
    logoScale: '--logo-scale',
    moduleRadius: '--module-radius',
    label: '--label',
    labelFontSize: '--label-font-size',
  };

  const parts = [];
  for (const [key, value] of Object.entries(parsed)) {
    if (value === undefined || value === null || value === '') continue;
    if ((key === 'transparent' || key === 'includeLogo') && value === true) {
      if (key === 'transparent') parts.push('--transparent');
      continue;
    }
    if (key === 'includeLogo') continue;
    const optionName = optionMap[key];
    if (!optionName) continue;
    parts.push(optionName, String(value));
  }
  return parts.join(' ');
}

function normalizeBundleExecutionArgs(bundle, sessionId, userRequest, contextHint, inputPath, outputPath, stylePath) {
  if (bundle?.manifest?.entry?.includes('qr_generator.mjs')) {
    const rawInput = String(inputPath || userRequest || '').trim();
    const normalizedOutput = String(outputPath || 'output/qr-code.png').trim();
    const normalizedOptions = String(buildQrOptionsFromContext(stylePath) || buildQrOptionsFromContext(contextHint) || stylePath || '').trim();
    return {
      sessionId,
      userRequest,
      contextHint,
      inputPath: rawInput,
      outputPath: normalizedOutput,
      stylePath: normalizedOptions,
    };
  }

  return { sessionId, userRequest, contextHint, inputPath, outputPath, stylePath };
}

function normalizeCommunitySkillCallArgs(args = [], expectedArgCount = 0) {
  if (args.length === 1 && args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
    const payload = args[0];
    const rawArgs = Array.isArray(payload.rawArgs) ? payload.rawArgs : [];
    return {
      sessionId: String(payload.sessionId || '').trim(),
      userRequest: String(rawArgs[0] || '').trim(),
      contextHint: String(rawArgs[1] || '').trim(),
      inputPath: String(rawArgs[2] || '').trim(),
      outputPath: String(rawArgs[3] || '').trim(),
      stylePath: String(rawArgs[4] || '').trim(),
      rawArgs,
    };
  }

  if (expectedArgCount > 0 && args.length === expectedArgCount + 1) {
    const sessionId = String(args[args.length - 1] || '').trim();
    const rawArgs = args.slice(0, expectedArgCount);
    return {
      sessionId,
      userRequest: String(rawArgs[0] || '').trim(),
      contextHint: String(rawArgs[1] || '').trim(),
      inputPath: String(rawArgs[2] || '').trim(),
      outputPath: String(rawArgs[3] || '').trim(),
      stylePath: String(rawArgs[4] || '').trim(),
      rawArgs,
    };
  }

  if (args.length >= 6) {
    const [sessionId = '', userRequest = '', contextHint = '', inputPath = '', outputPath = '', stylePath = ''] = args;
    return {
      sessionId: String(sessionId || '').trim(),
      userRequest: String(userRequest || '').trim(),
      contextHint: String(contextHint || '').trim(),
      inputPath: String(inputPath || '').trim(),
      outputPath: String(outputPath || '').trim(),
      stylePath: String(stylePath || '').trim(),
      rawArgs: args,
    };
  }

  const [userRequest = '', contextHint = '', inputPath = '', outputPath = '', stylePath = ''] = args;
  return {
    sessionId: '',
    userRequest: String(userRequest || '').trim(),
    contextHint: String(contextHint || '').trim(),
    inputPath: String(inputPath || '').trim(),
    outputPath: String(outputPath || '').trim(),
    stylePath: String(stylePath || '').trim(),
    rawArgs: args,
  };
}

function expandSearchKeywordVariants(keywords = []) {
  const expanded = new Set();
  const splitPattern = /[\s,，。.!！?？:：;；、/|()（）\[\]"'“”‘’]+/;
  const connectorSplitPattern = /的|和|与|及|或|并|适合|用于|支持|帮助|生成|发布|文章|内容|风格/;

  for (const raw of keywords) {
    const value = String(raw || '').trim();
    if (!value) continue;
    expanded.add(value);

    for (const token of value.split(splitPattern).map((item) => item.trim()).filter(Boolean)) {
      expanded.add(token);
      if (/^[\u4e00-\u9fff]{4,}$/.test(token)) {
        for (const sub of token.split(connectorSplitPattern).map((item) => item.trim()).filter((item) => item.length >= 2)) {
          expanded.add(sub);
        }
        for (let size = 2; size <= Math.min(6, token.length); size += 1) {
          for (let i = 0; i <= token.length - size; i += 1) {
            expanded.add(token.slice(i, i + size));
          }
        }
      }
    }
  }

  return uniqueStrings([...expanded]).slice(0, 120);
}

function bundleRootFromSourcePath(sourcePath = '') {
  if (!sourcePath) return WORKSPACE_ROOT;
  return path.dirname(sourcePath);
}

function buildCommunitySkillDefinition({ name, description, body, sourcePath, frontmatterText, metadata = {} }) {
  const normalizedName = sanitizeSkillName(name);
  if (!normalizedName || !description || !body) {
    console.log(`[community-skills] 跳过无效 skill: file=${sourcePath}, normalizedName=${normalizedName || '(empty)'}, hasDescription=${Boolean(description)}, hasBody=${Boolean(body)}`);
    return null;
  }

  const skillRoot = bundleRootFromSourcePath(sourcePath);
  const bundle = buildSkillBundleInfo(sourcePath, metadata, body);
  const params = buildParams(bundle);
  const communityKeywords = bundle
    ? [
        normalizedName,
        ...(bundle?.manifest?.keywords || []),
        ...(bundle?.capabilities || []),
        ...(bundle?.scripts || []),
        ...(bundle?.references || []),
        ...(bundle?.assets || []),
      ]
    : [
        normalizedName,
        ...extractKeywordsFromSkill(skillRoot, { ...metadata, name: normalizedName, description }, body, [], []),
      ];
  const func = async (...args) => {
    const parsedCall = normalizeCommunitySkillCallArgs(args, params.length);
    const { sessionId, userRequest, contextHint, inputPath, outputPath, stylePath } = parsedCall;

    const normalizedArgs = normalizeBundleExecutionArgs(bundle, sessionId, userRequest, contextHint, inputPath, outputPath, stylePath);
    const execution = tryExecuteBundle(
      bundle,
      normalizedArgs.sessionId,
      normalizedArgs.inputPath,
      normalizedArgs.outputPath,
      normalizedArgs.stylePath
    );
    if (execution) {
      return JSON.stringify({ source: 'community-skill', skillName: normalizedName, description, sourcePath, sessionId, userRequest, contextHint, ...execution }, null, 2);
    }
    return JSON.stringify({
      source: 'community-skill',
      skillName: normalizedName,
      description,
      sourcePath,
      bundle,
      sessionId,
      userRequest,
      contextHint,
      instructions: [
        `你正在使用社区 Skill：${normalizedName}`,
        `Skill 描述：${description}`,
        bundle ? `这是一个可执行 skill bundle，资源总数：${bundle.resourceCount}` : '这是一个纯文档 skill。',
        userRequest ? `用户当前请求：${userRequest}` : '',
        contextHint ? `补充上下文：${contextHint}` : '',
        inputPath ? `建议输入路径：${inputPath}` : '',
        outputPath ? `建议输出路径：${outputPath}` : '',
        stylePath ? `建议风格路径：${stylePath}` : '',
        '请严格依据以下 SKILL.md 内容处理当前任务；若信息不足，先向用户澄清。',
        '',
        frontmatterText ? `Frontmatter:\n${frontmatterText}\n` : '',
        body,
        bundle?.suggestedCommands?.length ? `\n可用执行命令:\n${bundle.suggestedCommands.map((cmd) => `- ${cmd}`).join('\n')}` : '',
      ].filter(Boolean).join('\n'),
    }, null, 2);
  };

  return {
    name: normalizedName,
    func,
    description,
    functionality: `${bundle ? '基于 skillMds 中社区 SKILL.md 自动注入的可执行 skill bundle' : '基于 skillMds 中社区 SKILL.md 自动注入的技能'}。源文件：${path.relative(WORKSPACE_ROOT, sourcePath)}`,
    params,
    example: bundle?.capabilities?.includes('pptx-build')
      ? `${normalizedName}("请根据 JSON 生成 PPTX 文件", "当前仓库是一个 Node.js 项目", "data/ppt_data.json", "output/presentation.pptx", "assets/styles/modern.json")`
      : `${normalizedName}("请按这个社区 skill 的规范帮我完成当前任务", "当前仓库是一个 Node.js 项目")`,
    keywords: expandSearchKeywordVariants(communityKeywords),
    source: 'community',
    sourcePath,
    bundle,
    rawContent: body,
  };
}

function buildManifestSuggestionFromBundle(bundle) {
  if (!bundle) return null;
  const manifest = bundle.manifest || null;
  if (!manifest) return null;

  const suggested = {
    runtime: manifest.runtime || '',
    entry: manifest.entry || '',
    workingDirectory: manifest.workingDirectory || '.',
    keywords: Array.isArray(manifest.keywords) ? manifest.keywords : [],
    dependencies: manifest.dependencies || {},
    runtimeOptions: manifest.runtimeOptions || {},
    install: manifest.install || {},
    input: manifest.input || undefined,
    commands: manifest.commands || {},
    defaults: manifest.defaults || {},
  };

  return suggested;
}

function writeManifestSuggestionToPath(manifestPath, suggestion, { overwrite = false, fillEmptyKeywords = false } = {}) {
  if (!manifestPath || !suggestion) {
    return { ok: false, reason: 'invalid-args', message: 'manifestPath 或 suggestion 为空' };
  }

  if (fs.existsSync(manifestPath) && !overwrite) {
    if (fillEmptyKeywords && Array.isArray(suggestion.keywords) && suggestion.keywords.length > 0) {
      const existing = readJsonIfExists(manifestPath);
      const existingKeywords = Array.isArray(existing?.keywords) ? existing.keywords.filter(Boolean) : [];
      if (existing && existingKeywords.length === 0) {
        const updated = { ...existing, keywords: uniqueStrings(suggestion.keywords) };
        fs.writeFileSync(manifestPath, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');
        return {
          ok: true,
          reason: 'keywords-filled',
          message: `已安全回填 manifest keywords: ${manifestPath}`,
          manifestPath,
          suggestion: updated,
        };
      }
    }

    return {
      ok: false,
      reason: 'manifest-exists',
      message: `manifest 已存在: ${manifestPath}`,
      manifestPath,
      suggestion,
    };
  }

  fs.writeFileSync(manifestPath, `${JSON.stringify(suggestion, null, 2)}\n`, 'utf8');
  return {
    ok: true,
    manifestPath,
    suggestion,
    message: `已写入 manifest 建议稿: ${manifestPath}`,
  };
}

export function generateManifestSuggestions(skillDir = DEFAULT_COMMUNITY_SKILLS_DIR) {
  const definitions = loadCommunitySkillDefinitions(skillDir);
  return definitions
    .filter((def) => def.bundle)
    .map((def) => ({
      skillName: def.name,
      sourcePath: def.sourcePath,
      manifestPath: def.bundle?.manifestPath || path.join(def.bundle.rootDir, 'manifest.json'),
      hasExplicitManifest: Boolean(def.bundle?.manifestPath),
      suggestion: buildManifestSuggestionFromBundle(def.bundle),
    }))
    .filter((item) => item.suggestion);
}

export function writeManifestSuggestionForSkill(skillName, skillDir = DEFAULT_COMMUNITY_SKILLS_DIR, { overwrite = false } = {}) {
  const suggestions = generateManifestSuggestions(skillDir);
  const target = suggestions.find((item) => item.skillName === skillName);
  if (!target) {
    return { ok: false, reason: 'skill-not-found', message: `未找到 skill: ${skillName}` };
  }

  return writeManifestSuggestionToPath(target.manifestPath, target.suggestion, { overwrite });
}

export {
  detectPythonCommand,
  detectNodeCommand,
  installPythonDependencies,
  installNodeDependencies,
  checkPythonDependencies,
  checkNodeDependencies,
  tryExecuteBundle,
  getRuntimeHandler,
};

export function loadCommunitySkillDefinitions(skillDir = DEFAULT_COMMUNITY_SKILLS_DIR) {
  try {
    if (!CONFIG.supportCommunitySkills) {
      console.log(`[community-skills] 社区SKILL支持未开启`);
      return [];
    }
    console.log(`[community-skills] 开始扫描目录: ${skillDir}`);
    const markdownFiles = collectMarkdownFiles(skillDir, true);
    console.log(`[community-skills] 扫描完成，发现 Markdown 文件 ${markdownFiles.length} 个`);
    const definitions = [];
    const seenNames = new Set();

    for (const filePath of markdownFiles) {
      console.log(`[community-skills] 读取文件: ${filePath}`);
      const content = fs.readFileSync(filePath, 'utf8');
      const { metadata, body, frontmatterText } = parseFrontmatter(content);
      if (!metadata?.name || !metadata?.description) {
        console.log(`[community-skills] 跳过文件，缺少必要 frontmatter: ${filePath}`);
        continue;
      }

      const definition = buildCommunitySkillDefinition({ name: metadata.name, description: metadata.description, body, sourcePath: filePath, frontmatterText, metadata });
      if (!definition) continue;
      if (seenNames.has(definition.name)) {
        console.log(`[community-skills] 跳过重复 skill: ${definition.name}, file=${filePath}`);
        continue;
      }

      seenNames.add(definition.name);
      definitions.push(definition);

      if (definition.bundle) {
        const suggestedManifest = buildManifestSuggestionFromBundle(definition.bundle);
        const targetManifestPath = path.join(definition.bundle.rootDir, 'manifest.json');
        const writeResult = writeManifestSuggestionToPath(targetManifestPath, suggestedManifest, { overwrite: false, fillEmptyKeywords: true });
        if (writeResult.ok) {
          if (!definition.bundle.manifestPath) definition.bundle.manifestPath = writeResult.manifestPath;
          if (writeResult.reason === 'keywords-filled') {
            definition.bundle.manifest = mergeManifestWithInferred(writeResult.suggestion, definition.bundle.manifest);
            console.log(`[community-skills] 已回填 manifest keywords: ${writeResult.manifestPath}`);
          } else {
            console.log(`[community-skills] 已自动生成 manifest: ${writeResult.manifestPath}`);
          }
        } else if (writeResult.reason !== 'manifest-exists') {
          console.log(`[community-skills] manifest 自动生成跳过: ${writeResult.message}`);
        }
      }

      console.log(`[community-skills] 已加载 skill: ${definition.name}${definition.bundle ? ` (bundle, resources=${definition.bundle.resourceCount})` : ''}`);
    }

    console.log(`[community-skills] 加载完成，共注册 ${definitions.length} 个 community skills`);
    return definitions;
  } catch (error) {
    console.warn(`社区技能加载失败: ${error.message}`);
    return [];
  }
}
