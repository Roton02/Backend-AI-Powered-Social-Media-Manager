// Current MVP scope: post scheduling only. Retain AI code for future work,
// but never start its worker, generate replies or send automatic messages.
// Manual inbox (Messenger + Instagram DMs, human replies only) was approved by the owner on 2026-11-11.
export const featureFlags = { aiAutomation: false, manualInbox: true };
