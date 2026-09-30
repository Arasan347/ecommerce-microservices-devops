const { PrismaClient } = require('@prisma/client');
const { z } = require('zod');
const { NotFoundError, InsufficientStockError } = require('../utils/errors');

const prisma = new PrismaClient();

const createProductSchema = z.object({
  name: z.string().min(1, 'Product name is required').trim(),
  description: z.string().min(1, 'Description is required').trim(),
  priceInPaise: z.number().int('priceInPaise must be an integer').gt(0, 'priceInPaise must be greater than 0').optional(),
  price: z.number().gt(0, 'Price must be greater than 0').optional(),
  stock: z.number().int('Stock must be an integer').min(0, 'Stock cannot be negative')
}).refine(data => data.priceInPaise !== undefined || data.price !== undefined, {
  message: 'Either priceInPaise or price must be provided',
  path: ['priceInPaise']
});

const updateProductSchema = z.object({
  name: z.string().min(1, 'Product name cannot be empty').trim().optional(),
  description: z.string().min(1, 'Description cannot be empty').trim().optional(),
  priceInPaise: z.number().int('priceInPaise must be an integer').gt(0).optional(),
  price: z.number().gt(0).optional(),
  stock: z.number().int('Stock must be an integer').min(0, 'Stock cannot be negative').optional()
});

const reserveStockSchema = z.object({
  quantity: z.number().int('Quantity must be an integer').min(1, 'Quantity must be at least 1')
});

const createProduct = async (req, res, next) => {
  try {
    const validated = createProductSchema.parse(req.body);
    const priceInPaise = validated.priceInPaise ?? Math.round(validated.price * 100);

    const product = await prisma.product.create({
      data: {
        name: validated.name,
        description: validated.description,
        priceInPaise,
        stock: validated.stock
      }
    });

    return res.status(201).json(product);
  } catch (error) {
    next(error);
  }
};

const getProducts = async (req, res, next) => {
  try {
    const products = await prisma.product.findMany();
    return res.status(200).json(products);
  } catch (error) {
    next(error);
  }
};

const getProductById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const product = await prisma.product.findUnique({
      where: { id }
    });

    if (!product) {
      throw new NotFoundError('Product not found');
    }

    return res.status(200).json(product);
  } catch (error) {
    next(error);
  }
};

const updateProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    const validated = updateProductSchema.parse(req.body);

    const existingProduct = await prisma.product.findUnique({
      where: { id }
    });

    if (!existingProduct) {
      throw new NotFoundError('Product not found');
    }

    const updateData = { ...validated };
    if (validated.price !== undefined && validated.priceInPaise === undefined) {
      updateData.priceInPaise = Math.round(validated.price * 100);
      delete updateData.price;
    }

    const updatedProduct = await prisma.product.update({
      where: { id },
      data: updateData
    });

    return res.status(200).json(updatedProduct);
  } catch (error) {
    next(error);
  }
};

const deleteProduct = async (req, res, next) => {
  try {
    const { id } = req.params;

    const existingProduct = await prisma.product.findUnique({
      where: { id }
    });

    if (!existingProduct) {
      throw new NotFoundError('Product not found');
    }

    await prisma.product.delete({
      where: { id }
    });

    return res.status(200).json({ message: 'Product deleted successfully' });
  } catch (error) {
    next(error);
  }
};

const reserveStock = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { quantity } = reserveStockSchema.parse(req.body);

    const updatedProduct = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id }
      });

      if (!product) {
        throw new NotFoundError('Product not found');
      }

      if (product.stock < quantity) {
        throw new InsufficientStockError(
          `Product ${product.name} (ID: ${product.id}) has insufficient stock. Available: ${product.stock}, requested: ${quantity}`
        );
      }

      return await tx.product.update({
        where: { id },
        data: {
          stock: {
            decrement: quantity
          }
        }
      });
    });

    return res.status(200).json(updatedProduct);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createProductSchema,
  updateProductSchema,
  reserveStockSchema,
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  reserveStock
};
