import catchAsync from "../../../../shared/catchAsync";
import sendResponse from "../../../../shared/sendResponse";
import prisma from "../../../../shared/prisma";
import httpStatus from "http-status";
import ApiError from "../../../../errors/ApiErrors";
import { Request, Response } from "express";

const getProducts = catchAsync(async (req: Request, res: Response) => {
  const workspaceId = req.headers["x-workspace-id"] as string;
  const products = await prisma.product.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
  });

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Products retrieved successfully",
    data: products,
  });
});

const createProduct = catchAsync(async (req: Request, res: Response) => {
  const workspaceId = req.headers["x-workspace-id"] as string;
  const { name, sku, category, price, stock, status } = req.body;

  const existing = await prisma.product.findUnique({ where: { sku } });
  if (existing) throw new ApiError(409, "Product with this SKU already exists");

  const product = await prisma.product.create({
    data: {
      workspaceId,
      name,
      sku,
      category,
      price,
      stock,
      status,
    },
  });

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: "Product created successfully",
    data: product,
  });
});

const updateProduct = catchAsync(async (req: Request, res: Response) => {
  const workspaceId = req.headers["x-workspace-id"] as string;
  const { id } = req.params;
  const { name, category, price, stock, status } = req.body;

  const existing = await prisma.product.findFirst({ where: { id, workspaceId } });
  if (!existing) throw new ApiError(404, "Product not found");

  const product = await prisma.product.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(category !== undefined && { category }),
      ...(price !== undefined && { price: Number(price) }),
      ...(stock !== undefined && { stock: Number(stock) }),
      ...(status !== undefined && { status }),
    },
  });

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Product updated successfully",
    data: product,
  });
});

const deleteProduct = catchAsync(async (req: Request, res: Response) => {
  const workspaceId = req.headers["x-workspace-id"] as string;
  const { id } = req.params;

  const existing = await prisma.product.findFirst({ where: { id, workspaceId } });
  if (!existing) throw new ApiError(404, "Product not found");

  await prisma.product.delete({ where: { id } });

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Product deleted successfully",
  });
});

export const productController = {
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct,
};
