"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const crypto_1 = require("crypto");
const generateOTP = () => (0, crypto_1.randomInt)(100000, 1000000).toString();
exports.default = generateOTP;
