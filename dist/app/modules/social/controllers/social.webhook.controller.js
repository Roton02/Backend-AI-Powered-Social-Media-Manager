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
exports.socialWebhookController = void 0;
exports.validMetaSignature = validMetaSignature;
const crypto_1 = require("crypto");
const inbox_service_1 = require("../services/inbox.service");
function validMetaSignature(raw, signature, secret) {
    if (!raw || !secret || !signature || !/^sha256=[a-f0-9]{64}$/.test(signature))
        return false;
    const expected = (0, crypto_1.createHmac)('sha256', secret).update(raw).digest();
    return (0, crypto_1.timingSafeEqual)(expected, Buffer.from(signature.slice(7), 'hex'));
}
exports.socialWebhookController = {
    verify(req, res) {
        if (process.env.META_WEBHOOK_VERIFY_TOKEN && req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === process.env.META_WEBHOOK_VERIFY_TOKEN)
            return res.status(200).send(req.query['hub.challenge']);
        return res.sendStatus(403);
    },
    handleWebhook(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!validMetaSignature(req.rawBody, req.headers['x-hub-signature-256'], process.env.FACEBOOK_CLIENT_SECRET))
                return res.sendStatus(403);
            const platform = req.body.object === 'instagram' ? 'INSTAGRAM' : req.body.object === 'page' ? 'FACEBOOK' : null;
            if (!platform)
                return res.sendStatus(400);
            try {
                yield inbox_service_1.inboxService.normalizeAndSave(platform, req.body);
                return res.sendStatus(200);
            }
            catch (_a) {
                return res.sendStatus(503);
            }
        });
    }
};
