#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const pathsScript = path.join(__dirname, 'whistle-paths.js');

function parseArgs(argv) {
  const args = { type: 'rules' };
  const passthrough = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') {
      args.json = true;
      passthrough.push(arg);
    } else if (arg === '--type') {
      args.type = argv[++i] || 'rules';
    } else if (['--storage', '-S', '--baseDir', '-D', '--dataDirname', '--whistleName', '--name', '--whistlePath'].includes(arg)) {
      passthrough.push(arg, argv[++i] || '');
    }
  }
  return { args, passthrough };
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

function decodeFile(file) {
  const match = /^(\d+)\.(.+)$/.exec(file);
  if (!match) {
    return null;
  }
  let name = match[2];
  try {
    name = decodeURIComponent(name);
  } catch (_) {}
  return { index: Number(match[1]), name, file };
}

function listStorage(paths, type) {
  const dir = type === 'values' ? paths.valuesDir : paths.rulesDir;
  const filesDir = path.join(dir, 'files');
  const propertiesPath = path.join(dir, 'properties');
  const properties = readJson(propertiesPath, {});
  let files = [];
  try {
    files = fs.readdirSync(filesDir).map(decodeFile).filter(Boolean);
  } catch (_) {}
  const byName = new Map(files.map((item) => [item.name, item]));
  const order = Array.isArray(properties.filesOrder) ? properties.filesOrder : files.sort((a, b) => a.index - b.index).map((item) => item.name);
  const ordered = [];
  const seen = new Set();
  order.forEach((name) => {
    const item = byName.get(name);
    if (item) {
      seen.add(name);
      ordered.push(item);
    }
  });
  files.sort((a, b) => a.index - b.index).forEach((item) => {
    if (!seen.has(item.name)) {
      ordered.push(item);
    }
  });
  return {
    type,
    dir,
    filesDir,
    propertiesPath,
    entries: ordered.map((item) => ({
      index: item.index,
      name: item.name,
      diskName: item.file,
      filePath: path.join(filesDir, item.file)
    }))
  };
}

const { args, passthrough } = parseArgs(process.argv.slice(2));
if (args.type !== 'rules' && args.type !== 'values') {
  console.error('Usage: whistle-storage-list.js --type rules|values [--storage name] [--json]');
  process.exit(2);
}

const paths = getPaths(passthrough);
const result = listStorage(paths, args.type);

if (args.json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`${result.type}: ${result.dir}`);
  console.log(`properties: ${result.propertiesPath}`);
  if (!result.entries.length) {
    console.log('(no entries found)');
  } else {
    result.entries.forEach((item) => {
      console.log(`${item.index}\t${item.name}\t${item.filePath}`);
    });
  }
}
