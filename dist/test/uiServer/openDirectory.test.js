"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const uiServer_1 = require("../../src/uiServer");
(0, node_test_1.default)('selects a platform-specific command for opening the cache directory', () => {
    strict_1.default.deepEqual((0, uiServer_1.getOpenDirectoryCommand)('/tmp/cache', 'darwin'), {
        command: 'open',
        args: ['/tmp/cache'],
    });
    strict_1.default.deepEqual((0, uiServer_1.getOpenDirectoryCommand)('/tmp/cache', 'win32'), {
        command: 'cmd',
        args: ['/c', 'start', '', '/tmp/cache'],
    });
    strict_1.default.deepEqual((0, uiServer_1.getOpenDirectoryCommand)('/tmp/cache', 'linux'), {
        command: 'xdg-open',
        args: ['/tmp/cache'],
    });
});
