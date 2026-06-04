#!/usr/bin/env node

const os = require('os');
const path = require('path');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') {
      args.json = true;
    } else if (arg === '--storage' || arg === '-S') {
      args.storage = argv[++i] || '';
    } else if (arg === '--baseDir' || arg === '-D') {
      args.baseDir = argv[++i] || '';
    } else if (arg === '--dataDirname') {
      args.dataDirname = argv[++i] || '';
    } else if (arg === '--whistleName' || arg === '--name') {
      args.whistleName = argv[++i] || '';
    } else if (arg === '--whistlePath') {
      args.whistlePath = argv[++i] || '';
    }
  }
  return args;
}

function home() {
  return os.homedir() || process.env[process.platform === 'win32' ? 'USERPROFILE' : 'HOME'] || '~';
}

function getHomePath(dir) {
  if (!dir || !/^[~～]\//.test(dir)) {
    return dir;
  }
  return path.join(home(), `.${dir.substring(1)}`);
}

function enc(value) {
  return encodeURIComponent(value);
}

function buildPaths(args) {
  const whistleRoot = getHomePath(args.whistlePath || process.env.WHISTLE_PATH) || path.join(home(), '.WhistleAppData');
  const dataDirname = args.dataDirname || '.whistle';
  const baseRoot = args.baseDir
    ? path.resolve(getHomePath(args.baseDir), args.dataDirname || '')
    : (args.whistleName ? path.join(whistleRoot, 'all_whistles', args.whistleName) : path.join(whistleRoot, dataDirname));
  const storageName = args.storage && enc(args.storage);
  const activeBase = storageName ? path.join(baseRoot, 'custom_dirs', storageName) : baseRoot;
  const stateName = enc(`#${args.storage ? `${args.storage}#` : ''}`);
  return {
    home: home(),
    whistleRoot,
    baseRoot,
    activeBase,
    storage: args.storage || '',
    rulesDir: path.join(activeBase, 'rules'),
    rulesFilesDir: path.join(activeBase, 'rules', 'files'),
    rulesProperties: path.join(activeBase, 'rules', 'properties'),
    valuesDir: path.join(activeBase, 'values'),
    valuesFilesDir: path.join(activeBase, 'values', 'files'),
    valuesProperties: path.join(activeBase, 'values', 'properties'),
    propertiesDir: path.join(activeBase, 'properties'),
    tempFilesDir: path.join(whistleRoot, 'temp_files'),
    customPluginsDir: args.whistleName ? path.join(activeBase, 'custom_plugins') : path.join(whistleRoot, 'custom_plugins'),
    devPluginsDir: path.join(whistleRoot, 'dev_plugins'),
    customCertsDir: args.whistleName ? path.join(activeBase, 'custom_certs') : path.join(whistleRoot, 'custom_certs'),
    savedSessionsDir: args.whistleName ? path.join(activeBase, 'saved_sessions') : path.join(whistleRoot, 'saved_sessions'),
    startupStateFile: path.join(home(), '.startingAppData', stateName)
  };
}

const args = parseArgs(process.argv.slice(2));
const paths = buildPaths(args);

if (args.json) {
  console.log(JSON.stringify(paths, null, 2));
} else {
  Object.keys(paths).forEach((key) => {
    console.log(`${key}: ${paths[key]}`);
  });
}
