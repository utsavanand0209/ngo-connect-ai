const express = require('express');
const router = express.Router();
const NGO = require('../models/NGO');
const auth = require('../middleware/auth');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

// Public list verified NGOs + search by category/location
router.get('/', async (req, res) => {
  try {
    const { category, location, q } = req.query;
    const filter = { verified: true };
    if (category) filter.category = category;
    if (location) filter.location = new RegExp(location, 'i');
    if (q) filter.$or = [{ name: new RegExp(q, 'i') }, { description: new RegExp(q, 'i') }];
    const ngos = await NGO.find(filter);
    res.json(ngos);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// NGO profile (public if verified)
router.get('/:id', async (req, res) => {
  try {
    const ngo = await NGO.findById(req.params.id);
    if (!ngo) return res.status(404).json({ message: 'Not found' });
    if (!ngo.verified) return res.status(403).json({ message: 'NGO not verified' });
    res.json(ngo);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// NGO get their own profile
router.get('/me', auth(['ngo', 'admin', 'user']), async (req, res) => {
  try {
    const ngo = await NGO.findById(req.user.id);
    if (!ngo) return res.status(404).json({ message: 'NGO not found', ngo: null });
    res.json(ngo);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// NGO updates (only ngo role)
router.put('/me', auth(['ngo', 'admin', 'user']), async (req, res) => {
  try {
    const ngo = await NGO.findByIdAndUpdate(req.user.id, req.body, { new: true });
    res.json(ngo);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Upload verification docs
router.post('/me/verify', auth(['ngo', 'admin', 'user']), upload.array('docs', 5), async (req, res) => {
  try {
    const paths = req.files.map(f => f.path);
    const ngo = await NGO.findByIdAndUpdate(req.user.id, { $push: { verificationDocs: { $each: paths } } }, { new: true });
    res.json({ message: 'Documents uploaded', ngo });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
