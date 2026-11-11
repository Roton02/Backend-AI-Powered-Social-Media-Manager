import { Queue } from "bullmq";
import Redis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

const redisConnection = new Redis(process.env.REDIS_URL || "redis://127.0.0.1:6379", {
  maxRetriesPerRequest: null,
});

class QueueService {
  private queues: Map<string, Queue> = new Map();

  async getQueue(queueName: string): Promise<Queue> {
    if (this.queues.has(queueName)) {
      return this.queues.get(queueName)!;
    }

    const queue = new Queue(queueName, {
      connection: redisConnection,
    });

    this.queues.set(queueName, queue);
    return queue;
  }

  async addJob(queueName: string, jobName: string, data: any, options: any = {}) {
    const queue = await this.getQueue(queueName);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        queue.add(jobName, data, options),
        new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>reject(new Error("Queue unavailable")),5000);}),
      ]);
    } finally { if(timer) clearTimeout(timer); }
  }

  async removeJob(queueName: string, jobId: string) {
    const queue = await this.getQueue(queueName);
    await queue.remove(jobId);
  }
}

export const queueService = new QueueService();
export { redisConnection };
