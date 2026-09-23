const { PrismaClient } = require('@prisma/client');
const { z } = require('zod');
const { NotFoundError } = require('../utils/errors');

const prisma = new PrismaClient();

const createProductSchema = z.object({
  name: z.string().min(1, 'Product name is required').trim(),
  description: z.string().min(1, 'Description is required').trim(),
  price: z.number().gt(0, 'Price must be greater than 0'),
  stock: z.number().int('Stock must be an integer').min(0, 'Stock cannot be negative')
});

const updateProductSchema = z.object({
  name: z.string().min(1, 'Product name cannot be empty').trim().optional(),
  description: z.string().min(1, 'Description cannot be empty').trim().optional(),
  price: z.number().gt(0, 'Price must be greater than 0').optional(),
  stock: z.number().int('Stock must be an integer').min(0, 'Stock cannot be negative').optional()
});

const createProduct = async (req, res, next) => {
  try {
    const { name, description, price, stock } = req.body;

    const product = await prisma.product.create({
      data: {
        name,
        description,
        price,
        stock
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

    const existingProduct = await prisma.product.findUnique({
      where: { id }
    });

    if (!existingProduct) {
      throw new NotFoundError('Product not found');
    }

    const updatedProduct = await prisma.product.update({
      where: { id },
      data: req.body
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

module.exports = {
  createProductSchema,
  updateProductSchema,
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct
};
