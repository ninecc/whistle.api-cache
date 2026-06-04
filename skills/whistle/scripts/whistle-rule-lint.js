#!/usr/bin/env node

const fs = require('fs');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--file' || arg === '-f') {
      args.file = argv[++i];
    } else if (arg === '--text') {
      args.text = argv[++i] || '';
    } else if (arg === '--json') {
      args.json = true;
    }
  }
  return args;
}

function readInput(args) {
  if (args.text != null) {
    return args.text;
  }
  if (args.file) {
    return fs.readFileSync(args.file, 'utf8');
  }
  return fs.readFileSync(0, 'utf8');
}

function stripInlineComment(line) {
  let quote = '';
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if ((ch === '"' || ch === "'") && line[i - 1] !== '\\') {
      quote = quote === ch ? '' : quote || ch;
    }
    if (!quote && ch === '#') {
      const prev = line[i - 1];
      if (!prev || /\s/.test(prev)) {
        return line.substring(0, i).trim();
      }
    }
  }
  return line.trim();
}

function tokenize(line) {
  const tokens = [];
  let cur = '';
  let quote = '';
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if ((ch === '"' || ch === "'") && line[i - 1] !== '\\') {
      quote = quote === ch ? '' : quote || ch;
      cur += ch;
      continue;
    }
    if (!quote && /\s/.test(ch)) {
      if (cur) {
        tokens.push(cur);
        cur = '';
      }
    } else {
      cur += ch;
    }
  }
  if (cur) {
    tokens.push(cur);
  }
  return tokens;
}

function opName(token) {
  const index = token.indexOf('://');
  return index === -1 ? '' : token.substring(0, index);
}

function opValue(token) {
  const index = token.indexOf('://');
  return index === -1 ? '' : token.substring(index + 3);
}

function hasProtocol(token) {
  return /^[a-z][a-z\d+.-]*:\/\//i.test(token);
}

function isLikelyOperation(token, position) {
  if (!hasProtocol(token)) {
    return false;
  }
  if (position === 1 && /^https?$|^wss?$/.test(opName(token))) {
    return true;
  }
  return true;
}

function add(issues, severity, line, message, rule) {
  issues.push({ severity, line, message, rule });
}

function lintRegexPattern(pattern, lineNo, raw, issues) {
  if (!pattern.startsWith('/')) {
    return;
  }
  const last = pattern.lastIndexOf('/');
  if (last <= 0) {
    return;
  }
  const body = pattern.substring(1, last);
  const flags = pattern.substring(last + 1);
  if (!/^[dgimsuvy]*$/.test(flags)) {
    return;
  }
  try {
    new RegExp(body, flags);
  } catch (err) {
    add(issues, 'error', lineNo, `正则 pattern 无法解析：${err.message}`, raw);
  }
}

function lintPattern(pattern, lineNo, raw, issues) {
  lintRegexPattern(pattern, lineNo, raw, issues);
  if (/^\*\*\./.test(pattern) || /^[a-z]+:\/\/\*\*\./i.test(pattern) || /^\/\/\*\*\./.test(pattern)) {
    add(issues, 'warning', lineNo, '`**.example.com` 不匹配根域 example.com；如需根域和子域都匹配，写两条规则。', raw);
  }
  const withoutScheme = pattern.replace(/^[a-z*]+:\/\//i, '').replace(/^\/\//, '');
  const slash = withoutScheme.indexOf('/');
  if (!pattern.startsWith('^') && slash !== -1) {
    const pathPart = withoutScheme.substring(slash);
    if (pathPart.includes('*')) {
      add(issues, 'warning', lineNo, '路径里的 `*` 要作为通配符使用时，pattern 前必须加 `^`。', raw);
    }
  }
}

function lintLine(raw, lineNo, issues) {
  const line = stripInlineComment(raw);
  if (!line || line.startsWith('#')) {
    return;
  }
  if (/^`{3,}/.test(line)) {
    return 'toggleFence';
  }
  const tokens = tokenize(line);
  if (!tokens.length) {
    return;
  }
  if (tokens.length < 2) {
    add(issues, 'error', lineNo, '规则缺少 operation，应为 pattern operation。', raw);
    return;
  }
  const pattern = tokens[0];
  lintPattern(pattern, lineNo, raw, issues);
  const operations = tokens.slice(1).filter((token, index) => isLikelyOperation(token, index + 1));
  if (!operations.length) {
    add(issues, 'error', lineNo, '未识别到 operation。', raw);
  }
  if (/^proxy:\/\/(?:localhost|127\.0\.0\.1)(?::(?:\d+|port))?\/?$/i.test(tokens[1])) {
    add(issues, 'warning', lineNo, '`proxy://localhost` 是上游代理，不是转发到本地服务；本地服务通常用 `http://localhost:port`。', raw);
  }
  if (/^host:\/\//i.test(tokens[1]) && /https?:\/\//i.test(opValue(tokens[1]))) {
    add(issues, 'warning', lineNo, '`host://` 应填写 IP/host，不是 URL；转发 URL 用 `http://` 或 `https://`。', raw);
  }
  operations.forEach((op) => {
    const name = opName(op);
    const value = opValue(op);
    if (
      pattern.startsWith('^') &&
      pattern.includes('*') &&
      (/^(http|https|ws|wss|file)$/.test(name)) &&
      !/\$[0-9]/.test(value)
    ) {
      add(issues, 'warning', lineNo, '路径通配 pattern 不要依赖普通前缀映射的自动拼接；需要动态目标路径时显式使用 `$1/$2`。', raw);
    }
    if (name === 'reqBody') {
      const looksLikeMatcher = !/^\(|^\{|^\[|^\/|^[A-Za-z]:[\\/]|^~\//.test(value) && value.length > 8;
      if (looksLikeMatcher) {
        add(issues, 'warning', lineNo, '`reqBody://` 是改写请求体，不是匹配请求体；如果要匹配 body 内容，请使用 `includeFilter://b:...`。', raw);
      }
    }
    if (name === 'responseFor') {
      if (/^\(|^\{|^\[/.test(value) || /["']\s*:/.test(value)) {
        add(issues, 'warning', lineNo, '`responseFor://` 不是响应体 mock，只用于设置 Network 面板展示的 ServerIP；Mock JSON 用 `file://({...})`、`resBody://` 或 Values。', raw);
      }
    }
    if (name === 'pathReplace') {
      const inlineReplace = value.startsWith('(') && value.endsWith(')') ? value.slice(1, -1) : value;
      const eq = inlineReplace.indexOf('=');
      if (eq !== -1) {
        const search = inlineReplace.slice(0, eq);
        if (/^\^?\//.test(search)) {
          add(issues, 'warning', lineNo, '`pathReplace://` 匹配的 path 不含开头 `/`；替换开头路径应写成 `^api` 或 `/^api/`，不要写 `^/api`。', raw);
        }
      }
    }
    if (name === 'file') {
      if (/^\{[^{}:"',\s]+\}$/.test(value) || /^\(.+\)$/.test(value) || /^temp\//.test(value)) {
        return;
      }
      if (/^\{/.test(value) || /^\[/.test(value)) {
        add(issues, 'error', lineNo, 'JSON mock 应写成 `file://({...})`、Values 引用或本地文件路径。', raw);
      } else if (!/^\/|^[A-Za-z]:[\\/]|^~\//.test(value) && !/^https?:\/\//.test(value)) {
        add(issues, 'warning', lineNo, '`file://` 看起来不是 `file:///abs/path`、Values 或 temp 引用；本地绝对路径要用三个斜杠。', raw);
      }
    }
    if (name === 'reqHeaders' && /access-control-allow-/i.test(value)) {
      add(issues, 'warning', lineNo, 'CORS 响应头通常应使用 `resHeaders://` 或 `resCors://`，不是 `reqHeaders://`。', raw);
    }
    if (name === 'resHeaders' && /^(authorization|cookie|host)=/i.test(value)) {
      add(issues, 'warning', lineNo, 'authorization/cookie/host 通常是请求头，应确认是否应使用 `reqHeaders://`。', raw);
    }
    if ((name === 'jsAppend' || name === 'cssAppend' || name === 'htmlAppend') && !tokens.some((token) => token === 'lineProps://safeHtml' || token === 'lineProps://strictHtml')) {
      add(issues, 'warning', lineNo, '页面注入建议加 `lineProps://safeHtml` 或缩窄到 HTML 请求。', raw);
    }
    if (/Filter$/.test(name) && value.includes('&')) {
      add(issues, 'warning', lineNo, '复杂 AND 条件可能不适合 filter，必要时用 `reqScript/resScript`。', raw);
    }
  });
  if (/^\*($|[/:])/.test(pattern)) {
    add(issues, 'warning', lineNo, 'pattern 很宽，确认不会影响无关流量。', raw);
  }
}

function lint(text) {
  const issues = [];
  let inFence = false;
  text.split(/\r?\n/).forEach((line, index) => {
    if (/^`{3,}/.test(line.trim())) {
      inFence = !inFence;
      return;
    }
    if (!inFence) {
      lintLine(line, index + 1, issues);
    }
  });
  return issues;
}

const args = parseArgs(process.argv.slice(2));
const issues = lint(readInput(args));
if (args.json) {
  console.log(JSON.stringify({ ok: !issues.some((item) => item.severity === 'error'), issues }, null, 2));
} else if (!issues.length) {
  console.log('No issues found.');
} else {
  issues.forEach((item) => {
    console.log(`${item.severity.toUpperCase()} line ${item.line}: ${item.message}`);
    console.log(`  ${item.rule}`);
  });
}
process.exit(issues.some((item) => item.severity === 'error') ? 1 : 0);
