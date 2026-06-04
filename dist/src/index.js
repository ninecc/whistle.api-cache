"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uiServer = exports.resStatsServer = exports.server = void 0;
var server_1 = require("./server");
Object.defineProperty(exports, "server", { enumerable: true, get: function () { return __importDefault(server_1).default; } });
var resStatsServer_1 = require("./resStatsServer");
Object.defineProperty(exports, "resStatsServer", { enumerable: true, get: function () { return __importDefault(resStatsServer_1).default; } });
var uiServer_1 = require("./uiServer");
Object.defineProperty(exports, "uiServer", { enumerable: true, get: function () { return __importDefault(uiServer_1).default; } });
