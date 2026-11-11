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
exports.socketService = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = __importDefault(require("../config"));
const prisma_1 = __importDefault(require("./prisma"));
const socket_io_1 = require("socket.io");
class SocketService {
    constructor() {
        this.io = null;
    }
    init(httpServer) {
        this.io = new socket_io_1.Server(httpServer, {
            cors: {
                origin: '*', // In production, replace with allowed domains
                methods: ['GET', 'POST'],
            },
        });
        this.io.use((socket, next) => __awaiter(this, void 0, void 0, function* () {
            try {
                const claims = jsonwebtoken_1.default.verify(socket.handshake.auth.token || '', config_1.default.jwt.jwt_secret);
                if (!claims.id || claims.purpose)
                    throw new Error();
                const user = yield prisma_1.default.user.findUnique({ where: { id: claims.id } });
                if (!user || user.status !== 'Active')
                    throw new Error();
                socket.data.userId = user.id;
                next();
            }
            catch (_a) {
                next(new Error('Please sign in to continue.'));
            }
        }));
        this.io.on('connection', socket => {
            socket.join(`user:${socket.data.userId}`);
            socket.on('join_workspace', (workspaceId) => __awaiter(this, void 0, void 0, function* () {
                try {
                    if (typeof workspaceId !== 'string' || !/^[a-f0-9]{24}$/i.test(workspaceId))
                        return;
                    const member = yield prisma_1.default.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId: socket.data.userId } } });
                    if (member)
                        socket.join(`workspace:${workspaceId}`);
                }
                catch (_a) {
                    socket.emit('workspace-error', 'Could not join workspace.');
                }
            }));
        });
        return this.io;
    }
    emitToWorkspace(workspaceId, event, data) {
        if (!this.io)
            return;
        this.io.to(`workspace:${workspaceId}`).emit(event, data);
    }
    emitToUser(userId, event, data) {
        if (!this.io)
            return;
        // In a real scenario, we'd map userId to socketId in Redis
        this.io.to(`user:${userId}`).emit(event, data);
    }
    getIO() {
        return this.io;
    }
}
exports.socketService = new SocketService();
