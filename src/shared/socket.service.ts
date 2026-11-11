import jwt from 'jsonwebtoken';
import config from '../config';
import prisma from './prisma';
import { Server } from 'socket.io';
import { Server as HttpServer } from 'http';

class SocketService {
  private io: Server | null = null;

  public init(httpServer: HttpServer) {
    this.io = new Server(httpServer, {
      cors: {
        origin: '*', // In production, replace with allowed domains
        methods: ['GET', 'POST'],
      },
    });

    this.io.use(async (socket, next) => {
      try {
        const claims=jwt.verify(socket.handshake.auth.token || '',config.jwt.jwt_secret!) as jwt.JwtPayload;
        if(!claims.id || claims.purpose) throw new Error();
        const user=await prisma.user.findUnique({where:{id:claims.id}});
        if(!user || user.status!=='Active') throw new Error();
        socket.data.userId=user.id;next();
      } catch {next(new Error('Please sign in to continue.'));}
    });
    this.io.on('connection', socket => {
      socket.join(`user:${socket.data.userId}`);
      socket.on('join_workspace', async (workspaceId:string) => {
        try {
          if(typeof workspaceId!=='string' || !/^[a-f0-9]{24}$/i.test(workspaceId)) return;
          const member=await prisma.workspaceMember.findUnique({where:{workspaceId_userId:{workspaceId,userId:socket.data.userId}}});
          if(member) socket.join(`workspace:${workspaceId}`);
        } catch { socket.emit('workspace-error','Could not join workspace.'); }
      });
    });

    return this.io;
  }

  public emitToWorkspace(workspaceId: string, event: string, data: any) {
    if (!this.io) return;
    this.io.to(`workspace:${workspaceId}`).emit(event, data);
  }

  public emitToUser(userId: string, event: string, data: any) {
    if (!this.io) return;
    // In a real scenario, we'd map userId to socketId in Redis
    this.io.to(`user:${userId}`).emit(event, data);
  }

  public getIO() {
    return this.io;
  }
}

export const socketService = new SocketService();
