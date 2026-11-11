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
const stripe_1 = __importDefault(require("./stripe"));
const generateAccountLink = (accountId) => __awaiter(void 0, void 0, void 0, function* () {
    const accountLink = yield stripe_1.default.accountLinks.create({
        account: accountId,
        refresh_url: "https://yourdomain.com/reauth", // fallback URL
        return_url: "https://yourdomain.com/return", // after completing setup
        type: "account_onboarding",
    });
    return accountLink.url;
});
exports.default = generateAccountLink;
