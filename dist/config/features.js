"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.featureFlags = void 0;
// Current MVP scope: post scheduling only. Retain AI code for future work,
// but never start its worker, generate replies or send automatic messages.
exports.featureFlags = { aiAutomation: false };
