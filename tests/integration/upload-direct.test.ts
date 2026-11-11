// Isolated regression: post images must reach Cloudinary before the API responds,
// because Meta fetches the image URL. Cloudinary, Redis and disk writes are mocked.
import fs from 'fs';
jest.mock('../../src/config', () => ({ __esModule: true, default: { cloudinary: { cloud_name: 'demo', api_key: 'k', api_secret: 's' }, backend_base_url: 'http://localhost:5000' } }));
jest.mock('../../src/helpers/radis', () => ({ __esModule: true, default: { isOpen: true, lPush: jest.fn() } }));
jest.mock('../../src/helpers/compressImage', () => ({ compressImageForCloudinary: jest.fn(async (f: any) => f) }));
jest.mock('cloudinary', () => ({ v2: { config: jest.fn(), uploader: { upload_stream: jest.fn((_o: any, cb: any) => ({ end: () => cb(null, { secure_url: 'https://res.cloudinary.com/demo/image/upload/v1/x.jpg', public_id: 'x' }) })) } } }));
import redisClient from '../../src/helpers/radis';
import { v2 as cloudinary } from 'cloudinary';
import { uploadOne } from '../../src/helpers/uploadService';

const file = { buffer: Buffer.from('jpeg'), mimetype: 'image/jpeg', originalname: 'p.jpg', size: 4 } as Express.Multer.File;
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined);
  jest.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined);
});

test('direct upload returns a public HTTPS Cloudinary URL even when Redis is connected', async () => {
  const result = await uploadOne(file, { folder: 'social-posts', direct: true });
  expect(result.url).toBe('https://res.cloudinary.com/demo/image/upload/v1/x.jpg');
  expect(cloudinary.uploader.upload_stream).toHaveBeenCalled();
  expect((redisClient as any).lPush).not.toHaveBeenCalled();
});

test('default upload keeps the existing background-queue behaviour', async () => {
  const result = await uploadOne(file, { folder: 'chat' });
  expect(result.url.startsWith('http://localhost:5000/uploads/chat/')).toBe(true);
  expect((redisClient as any).lPush).toHaveBeenCalled();
  expect(cloudinary.uploader.upload_stream).not.toHaveBeenCalled();
});
