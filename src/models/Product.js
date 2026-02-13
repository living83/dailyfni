const { v4: uuidv4 } = require('uuid');

// 인메모리 상품 저장소
const products = new Map();

class Product {
  constructor({ name, category, description = '', priority = 'normal', tags = [] }) {
    this.id = uuidv4();
    this.name = name;
    this.category = category; // 'finance' | 'tech' | 'health' | 'lifestyle' | 'education'
    this.description = description;
    this.priority = priority; // 'low' | 'normal' | 'high' | 'urgent'
    this.tags = tags;
    this.status = 'active'; // 'active' | 'paused' | 'archived'
    this.lastHandledAt = null;
    this.handleCount = 0;
    this.createdAt = new Date().toISOString();
  }

  markHandled() {
    this.lastHandledAt = new Date().toISOString();
    this.handleCount++;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      category: this.category,
      description: this.description,
      priority: this.priority,
      tags: this.tags,
      status: this.status,
      lastHandledAt: this.lastHandledAt,
      handleCount: this.handleCount,
      createdAt: this.createdAt,
    };
  }
}

function addProduct(data) {
  const product = new Product(data);
  products.set(product.id, product);
  return product;
}

function getProduct(id) {
  return products.get(id) || null;
}

function getAllProducts() {
  return Array.from(products.values());
}

function getActiveProducts() {
  return getAllProducts().filter(p => p.status === 'active');
}

function removeProduct(id) {
  return products.delete(id);
}

module.exports = { Product, addProduct, getProduct, getAllProducts, getActiveProducts, removeProduct };
