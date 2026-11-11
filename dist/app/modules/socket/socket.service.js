"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyWebSocketToken = verifyWebSocketToken;
const config_1 = __importDefault(require("../../../config"));
const jwtHelpers_1 = require("../../../helpers/jwtHelpers");
function verifyWebSocketToken(ws, token) {
    if (!token) {
        ws.send(JSON.stringify({ type: "error", message: "You are not authenticated" }));
        return null;
    }
    try {
        const decoded = jwtHelpers_1.jwtHelpers.verifyToken(token, config_1.default.jwt.jwt_secret);
        return decoded;
    }
    catch (error) {
        const errorMessage = error.name === "TokenExpiredError"
            ? "Token has expired!"
            : "Invalid token!";
        ws.send(JSON.stringify({ type: "error", message: errorMessage }));
        return null;
    }
}
