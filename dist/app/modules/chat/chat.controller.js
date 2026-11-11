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
exports.chatController = void 0;
const catchAsync_1 = __importDefault(require("../../../shared/catchAsync"));
const sendResponse_1 = __importDefault(require("../../../shared/sendResponse"));
const chat_service_1 = require("./chat.service");
const getAllRooms = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield chat_service_1.chatServices.getAllRooms(req.query, {
        id: req.user.id,
        role: req.user.role,
    });
    (0, sendResponse_1.default)(res, {
        statusCode: 200,
        success: true,
        message: "Chat rooms retrieved successfully",
        data: result,
    });
}));
const getDirectory = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield chat_service_1.chatServices.getDirectory(req.query);
    (0, sendResponse_1.default)(res, {
        statusCode: 200,
        success: true,
        message: "Chat directory retrieved successfully",
        data: result,
    });
}));
const openRoom = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield chat_service_1.chatServices.openRoom({ id: req.user.id, role: req.user.role }, req.body.receiverId);
    (0, sendResponse_1.default)(res, {
        statusCode: 201,
        success: true,
        message: "Chat room ready",
        data: result,
    });
}));
const getRoomById = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield chat_service_1.chatServices.getRoomById(req.params.roomId, {
        id: req.user.id,
        role: req.user.role,
    });
    (0, sendResponse_1.default)(res, {
        statusCode: 200,
        success: true,
        message: "Chat room retrieved successfully",
        data: result,
    });
}));
const getRoomMessages = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield chat_service_1.chatServices.getRoomMessages(req.params.roomId, req.query, {
        id: req.user.id,
        role: req.user.role,
    });
    (0, sendResponse_1.default)(res, {
        statusCode: 200,
        success: true,
        message: "Room messages retrieved successfully",
        data: result,
    });
}));
const sendMessage = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield chat_service_1.chatServices.sendMessage(req.params.roomId, { id: req.user.id, role: req.user.role, userName: req.user.userName }, req.body.content, req.file, req.body.fileUrl);
    (0, sendResponse_1.default)(res, {
        statusCode: 201,
        success: true,
        message: "Message sent successfully",
        data: result,
    });
}));
exports.chatController = {
    getAllRooms,
    getDirectory,
    openRoom,
    getRoomById,
    getRoomMessages,
    sendMessage,
};
