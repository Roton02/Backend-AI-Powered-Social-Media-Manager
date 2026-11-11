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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTechnicianConnectAccount = exports.createConnectedAccount = void 0;
const stripe_1 = __importDefault(require("stripe"));
const config_1 = __importDefault(require("../config"));
const stripe = new stripe_1.default(config_1.default.stripe.stripe_secret, {
    apiVersion: "2025-04-30.basil",
});
const createConnectedAccount = (hosterEmail) => __awaiter(void 0, void 0, void 0, function* () {
    const account = yield stripe.accounts.create({
        type: "express",
        country: "US",
        email: hosterEmail,
        capabilities: {
            transfers: { requested: true },
        },
    });
    return account.id; // save this Stripe Account ID in your DB for the worker
});
exports.createConnectedAccount = createConnectedAccount;
/**
 * Stripe Connect Express with card_payments is not available for BD.
 * Account creation is deferred/skipped at apply time so registration does not fail.
 */
const createTechnicianConnectAccount = (email) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const connectCountry = (_a = process.env.STRIPE_CONNECT_COUNTRY) === null || _a === void 0 ? void 0 : _a.toUpperCase();
    // Bangladesh requires cross-border Connect setup; skip at apply time.
    if (!connectCountry || connectCountry === "BD") {
        return undefined;
    }
    try {
        const account = yield stripe.accounts.create({
            type: "express",
            email,
            country: connectCountry,
            capabilities: {
                card_payments: { requested: true },
                transfers: { requested: true },
            },
        });
        return account.id;
    }
    catch (error) {
        console.warn("Stripe Connect account creation skipped:", error);
        return undefined;
    }
});
exports.createTechnicianConnectAccount = createTechnicianConnectAccount;
exports.default = stripe;
