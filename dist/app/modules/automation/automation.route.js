"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const automation_controller_1 = require("./automation.controller");
const tenantGuard_1 = __importDefault(require("../../middlewares/tenantGuard"));
const router = (0, express_1.Router)();
router.post("/execute", tenantGuard_1.default, automation_controller_1.automationController.executeAction);
exports.default = router;
