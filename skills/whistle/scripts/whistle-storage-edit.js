#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const pathsScript = path.join(__dirname, 'whistle-paths.js');

function parseArgs(argv) {
  const args = { type: 'rules', action: 'list' };
  const passthrough = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--type') {
      args.type = argv[++i] || 'rules';
    } else if (arg === '--action') {
      args.action = argv[++i] || 'list';
    } else if (arg === '--name') {
      args.name = argv[++i] || '';
    } else if (arg === '--content') {
      args.content = argv[++i] || '';
    } else if (arg === '--content-file') {
      args.contentFile = argv[++i] || '';
    } else if (arg === '--append') {
      args.append = true;
    } else if (arg === '--write') {
      args.write = true;
    } else if (arg === '--i-understand-storage-layout') {
      args.confirmStorageLayout = true;
    } else if (arg === '--allow-running') {
      args.allowRunning = true;
    } else if (arg === '--no-backup') {
      args.noBackup = true;
    } else if (arg === '--json') {
      args.json = true;
    } else if (['--storage', '-S', '--baseDir', '-D', '--dataDirname', '--whistleName', '--name-instance', '--whistlePath'].includes(arg)) {
      const key = arg === '--name-instance' ? '--whistleName' : arg;
      passthrough.push(key, argv[++i] || '');
    }
  }
  return { args, passthrough };
}

function fail(message) {
  console.error(message);
  process.exit(2);
}

function getPaths(passthrough) {
  const result = spawnSync(process.execPath, [pathsScript, '--json'].concat(passthrough), { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(result.stderr || 'failed to compute whistle paths');
  }
  return JSON.parse(result.stdout);
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function decodeFile(file) {
  const match = /^(\d+)\.(.+)$/.exec(file);
  if (!match) {
    return null;
  }
  let name = match[2];
  try {
    name = decodeURIComponent(name);
  } catch (_) {}
  return { index: Number(match[1]), name, diskName: file };
}

function encodeName(index, name) {
  return `${index}.${encodeURIComponent(name)}`;
}

function storageInfo(paths, type) {
  const dir = type === 'values' ? paths.valuesDir : paths.rulesDir;
  const filesDir = path.join(dir, 'files');
  const propertiesPath = path.join(dir, 'properties');
  const properties = readJson(propertiesPath, {});
  let files = [];
  try {
    files = fs.readdirSync(filesDir).map(decodeFile).filter(Boolean);
  } catch (_) {}
  const entries = new Map(files.map((item) => [item.name, item]));
  const maxIndex = files.reduce((max, item) => Math.max(max, item.index), -1);
  if (!Array.isArray(properties.filesOrder)) {
    properties.filesOrder = files.sort((a, b) => a.index - b.index).map((item) => item.name);
  }
  return { type, dir, filesDir, propertiesPath, properties, entries, maxIndex };
}

function readContent(args) {
  if (args.contentFile) {
    return fs.readFileSync(args.contentFile, 'utf8');
  }
  return args.content || '';
}

function isRunning(stateFile) {
  const state = readJson(stateFile, null);
  const pid = state && Number(state.pid);
  if (!pid) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (_) {
    return false;
  }
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    return false;
  }
  fs.cpSync(src, dest, { recursive: true });
  return true;
}

function backup(info) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = `${info.dir}.bak-${stamp}`;
  return copyDir(info.dir, dest) ? dest : '';
}

function orderedEntries(info) {
  const result = [];
  const seen = new Set();
  info.properties.filesOrder.forEach((name) => {
    const item = info.entries.get(name);
    if (item) {
      seen.add(name);
      result.push(item);
    }
  });
  Array.from(info.entries.values()).sort((a, b) => a.index - b.index).forEach((item) => {
    if (!seen.has(item.name)) {
      result.push(item);
    }
  });
  return result.map((item) => ({
    index: item.index,
    name: item.name,
    filePath: path.join(info.filesDir, item.diskName)
  }));
}

function planWrite(info, name, content, append) {
  const existing = info.entries.get(name);
  const index = existing ? existing.index : info.maxIndex + 1;
  const diskName = encodeName(index, name);
  const filePath = path.join(info.filesDir, diskName);
  let data = content;
  if (append && existing) {
    const oldPath = path.join(info.filesDir, existing.diskName);
    const old = fs.existsSync(oldPath) ? fs.readFileSync(oldPath, 'utf8') : '';
    data = old + (old.endsWith('\n') || !old ? '' : '\n') + content;
  }
  return { action: existing ? (append ? 'append' : 'update') : 'create', index, name, diskName, filePath, data };
}

function applyWrite(info, plan) {
  fs.mkdirSync(info.filesDir, { recursive: true });
  fs.writeFileSync(plan.filePath, plan.data);
  if (!info.properties.filesOrder.includes(plan.name)) {
    info.properties.filesOrder.push(plan.name);
  }
  writeJson(info.propertiesPath, info.properties);
}

const { args, passthrough } = parseArgs(process.argv.slice(2));
if (!['rules', 'values'].includes(args.type)) {
  fail('Usage: whistle-storage-edit.js --type rules|values --action list|read|write --name name [--content text|--content-file file] [--write]');
}
if (!['list', 'read', 'write'].includes(args.action)) {
  fail('Usage: --action list|read|write');
}
if (args.write && !args.confirmStorageLayout) {
  fail('Refusing to write without --i-understand-storage-layout. Whistle storage layout can vary by version, instance, storage name, and running UI cache; prefer UI paste unless the user explicitly accepts this risk.');
}

const paths = getPaths(passthrough);
const info = storageInfo(paths, args.type);
let result;

if (args.action === 'list') {
  result = { type: args.type, dir: info.dir, entries: orderedEntries(info) };
} else if (args.action === 'read') {
  if (!args.name) {
    fail('--name is required for read');
  }
  const entry = info.entries.get(args.name);
  if (!entry) {
    fail(`Entry not found: ${args.name}`);
  }
  const filePath = path.join(info.filesDir, entry.diskName);
  result = { type: args.type, name: args.name, filePath, content: fs.readFileSync(filePath, 'utf8') };
} else {
  if (!args.name) {
    fail('--name is required for write');
  }
  const content = readContent(args);
  const plan = planWrite(info, args.name, content, args.append);
  result = {
    dryRun: !args.write,
    running: isRunning(paths.startupStateFile),
    backup: '',
    plan: {
      action: plan.action,
      type: args.type,
      name: plan.name,
      filePath: plan.filePath,
      bytes: Buffer.byteLength(plan.data)
    }
  };
  if (result.running && !args.allowRunning) {
    result.blocked = 'Whistle appears to be running; rerun with --allow-running only if you accept overwrite/cache risk.';
  } else if (args.write) {
    result.backup = args.noBackup ? '' : backup(info);
    applyWrite(info, plan);
    result.written = true;
  }
}

if (args.json) {
  console.log(JSON.stringify(result, null, 2));
} else if (args.action === 'read') {
  console.log(result.content);
} else if (args.action === 'list') {
  console.log(`${result.type}: ${result.dir}`);
  result.entries.forEach((item) => console.log(`${item.index}\t${item.name}\t${item.filePath}`));
} else {
  console.log(JSON.stringify(result, null, 2));
}

if (result && result.blocked) {
  process.exit(1);
}
