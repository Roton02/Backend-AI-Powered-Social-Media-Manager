"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ollamaProvider = exports.OllamaProvider = exports.AIIntent = void 0;
var AIIntent;
(function (AIIntent) {
    AIIntent["ORDER_STATUS"] = "ORDER_STATUS";
    AIIntent["PRODUCT_INQUIRY"] = "PRODUCT_INQUIRY";
    AIIntent["GENERAL_CHAT"] = "GENERAL_CHAT";
    AIIntent["COMPLAINT"] = "COMPLAINT";
    AIIntent["UNKNOWN"] = "UNKNOWN";
})(AIIntent || (exports.AIIntent = AIIntent = {}));
class OllamaProvider {
    generateResponse(prompt_1) {
        return __awaiter(this, arguments, void 0, function* (prompt, systemPrompt = '') {
            try {
                const response = yield fetch(`${process.env.OLLAMA_API_URL || 'http://localhost:11434'}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(30000), body: JSON.stringify({ model: process.env.OLLAMA_MODEL || 'llama3.2', prompt, system: systemPrompt, stream: false, format: 'json', options: { temperature: 0 } }) });
                if (!response.ok)
                    throw new Error();
                const data = yield response.json();
                if (typeof data.response !== 'string' || !data.response.trim())
                    throw new Error();
                return data.response;
            }
            catch (_a) {
                throw new Error('AI provider unavailable');
            }
        });
    }
}
exports.OllamaProvider = OllamaProvider;
exports.ollamaProvider = new OllamaProvider();
