import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createWhistleLocalE2ERules,
  installWhistleLocalE2ERules,
} from '../../src/e2e/whistleLocal';

test('formats temporary local Whistle rules for the fake api port', () => {
  assert.equal(createWhistleLocalE2ERules(18080), [
    '# whistle.api-cache 本机真实联调临时规则',
    '# 测试完成后删除本段规则即可',
    'http://127.0.0.1:18080/__whistle_api_cache_e2e whistle.api-cache://auto',
    'http://localhost:18080/__whistle_api_cache_e2e whistle.api-cache://auto',
  ].join('\n'));
});

test('installs e2e rules list and restores only selected rules list', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-e2e-rules-'));
  const rulesDir = join(root, 'rules');
  await installWhistleLocalE2ERules({
    rulesDir,
    fakeApiPort: 18080,
    selectForRun: false,
  });

  const restore = await installWhistleLocalE2ERules({
    rulesDir,
    fakeApiPort: 18081,
    selectForRun: true,
  });
  let properties = JSON.parse(await readFile(join(rulesDir, 'properties'), 'utf8'));
  assert.deepEqual(properties.filesOrder, ['plugin_api_cache_e2e']);
  assert.deepEqual(properties.selectedList, ['plugin_api_cache_e2e']);

  await restore();
  properties = JSON.parse(await readFile(join(rulesDir, 'properties'), 'utf8'));
  assert.deepEqual(properties.filesOrder, ['plugin_api_cache_e2e']);
  assert.deepEqual(properties.selectedList, []);

  const content = await readFile(join(rulesDir, 'files', '0.plugin_api_cache_e2e'), 'utf8');
  assert.ok(content.includes('18081'));
});
