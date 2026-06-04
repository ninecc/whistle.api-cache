"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const state_1 = require("../../src/shared/state");
(0, node_test_1.default)('recordEvent keeps the newest cache diagnostic events first', () => {
    for (let index = 0; index < 25; index += 1) {
        (0, state_1.recordEvent)({
            type: 'BYPASS',
            method: 'GET',
            url: `https://example.test/api/${index}`,
            reason: `reason-${index}`,
        });
    }
    const events = (0, state_1.getRecentEvents)();
    strict_1.default.equal(events.length, 20);
    strict_1.default.equal(events[0].url, 'https://example.test/api/24');
    strict_1.default.equal(events[0].reason, 'reason-24');
    strict_1.default.equal(events[19].url, 'https://example.test/api/5');
    strict_1.default.equal(events[0].type, 'BYPASS');
    strict_1.default.ok(events[0].timestamp);
});
(0, node_test_1.default)('updateIgnoredQueryNames normalizes and stores query names', () => {
    const original = [...state_1.defaultProfile.ignoredQueryNames];
    try {
        const updated = (0, state_1.updateIgnoredQueryNames)([' _t ', 'wsgsig', '', 'wsgsig']);
        strict_1.default.deepEqual(updated, ['_t', 'wsgsig']);
        strict_1.default.deepEqual(state_1.defaultProfile.ignoredQueryNames, ['_t', 'wsgsig']);
    }
    finally {
        (0, state_1.updateIgnoredQueryNames)(original);
    }
});
