import test from 'node:test';
import assert from 'node:assert/strict';
import { getOpenDirectoryCommand } from '../../src/uiServer';

test('selects a platform-specific command for opening the cache directory', () => {
  assert.deepEqual(getOpenDirectoryCommand('/tmp/cache', 'darwin'), {
    command: 'open',
    args: ['/tmp/cache'],
  });
  assert.deepEqual(getOpenDirectoryCommand('/tmp/cache', 'win32'), {
    command: 'cmd',
    args: ['/c', 'start', '', '/tmp/cache'],
  });
  assert.deepEqual(getOpenDirectoryCommand('/tmp/cache', 'linux'), {
    command: 'xdg-open',
    args: ['/tmp/cache'],
  });
});
