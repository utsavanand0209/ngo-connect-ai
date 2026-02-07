const express = require('express');
const router = express.Router();
const NGO = require('../models/NGO');
const Category = require('../models/Category');
const auth = require('../middleware/auth');

// Public: categories that currently have registered NGOs (verified + active)
router.get('/', async (req, res) => {
  try {
    const ngos = await NGO.find({ verified: true, isActive: true }, 'category categories');
    const catSet = new Set();
    ngos.forEach(ngo => {
      if (ngo.category) catSet.add(ngo.category);
      if (Array.isArray(ngo.categories)) {
        ngo.categories.forEach(cat => cat && catSet.add(cat));
      }
    });
    res.json(Array.from(catSet));
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Public: all predefined categories (admin-managed list)
router.get('/all', async (req, res) => {
  try {
    const categories = await Category.find().sort({ name: 1 });
    res.json(categories);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: create category
router.post('/', auth(['admin']), async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: 'Name is required' });
    const category = await Category.create({ name, createdBy: req.user.id });
    res.json(category);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: 'Category already exists' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: update category
router.put('/:id', auth(['admin']), async (req, res) => {
  try {
    const { name } = req.body;
    const category = await Category.findByIdAndUpdate(
      req.params.id,
      { name },
      { new: true }
    );
    if (!category) return res.status(404).json({ message: 'Category not found' });
    res.json(category);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: delete category
router.delete('/:id', auth(['admin']), async (req, res) => {
  try {
    const deleted = await Category.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Category not found' });
    res.json({ message: 'Category deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
