const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const db      = require('../db');
const auth    = require('../middleware/auth');

const router     = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `avatar-${req.user.id}-${Date.now()}${ext}`);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Only image files are allowed'));
    cb(null, true);
  }
});

function makeToken(user) {
  return jwt.sign(
    { id: user.id, full_name: user.full_name },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

// POST /auth/register
router.post('/register', async (req, res) => {
  const { full_name, password } = req.body;

  if (!full_name || !password) {
    return res.status(400).json({ error: 'full_name and password are required' });
  }

  if (db.get('SELECT id FROM users WHERE LOWER(full_name) = LOWER(?)', [full_name.trim()])) {
    return res.status(409).json({ error: 'A user with this name already exists' });
  }

  const hashed = await bcrypt.hash(password, 10);
  const { lastInsertRowid } = db.run(
    'INSERT INTO users (full_name, password) VALUES (?, ?)',
    [full_name.trim(), hashed]
  );

  const user = { id: lastInsertRowid, full_name: full_name.trim(), avatar_url: null };
  res.status(201).json({ token: makeToken(user), user });
});

// POST /auth/login
router.post('/login', async (req, res) => {
  const { full_name, password } = req.body;

  if (!full_name || !password) {
    return res.status(400).json({ error: 'full_name and password are required' });
  }

  const user = db.get('SELECT * FROM users WHERE LOWER(full_name) = LOWER(?)', [full_name.trim()]);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (!(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: 'Incorrect password' });
  }

  res.json({
    token: makeToken(user),
    user: { id: user.id, full_name: user.full_name, avatar_url: user.avatar_url || null }
  });
});

// GET /auth/me — get current user profile
router.get('/me', auth, (req, res) => {
  const user = db.get(
    'SELECT id, full_name, avatar_url, created_at FROM users WHERE id = ?',
    [req.user.id]
  );
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
});

// PUT /auth/me — update full name
router.put('/me', auth, (req, res) => {
  const { full_name } = req.body;
  if (!full_name || !full_name.trim()) {
    return res.status(400).json({ error: 'full_name is required' });
  }

  const existing = db.get(
    'SELECT id FROM users WHERE LOWER(full_name) = LOWER(?) AND id != ?',
    [full_name.trim(), req.user.id]
  );
  if (existing) {
    return res.status(409).json({ error: 'A user with this name already exists' });
  }

  db.run('UPDATE users SET full_name = ? WHERE id = ?', [full_name.trim(), req.user.id]);

  const user = db.get('SELECT id, full_name, avatar_url FROM users WHERE id = ?', [req.user.id]);
  res.json({
    token: makeToken(user),
    user: { id: user.id, full_name: user.full_name, avatar_url: user.avatar_url || null }
  });
});

// PUT /auth/me/password — change password
router.put('/me/password', auth, async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'current_password and new_password are required' });
  }

  const user = db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (!(await bcrypt.compare(current_password, user.password))) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  const hashed = await bcrypt.hash(new_password, 10);
  db.run('UPDATE users SET password = ? WHERE id = ?', [hashed, req.user.id]);

  res.json({ message: 'Password updated successfully' });
});

// POST /auth/me/avatar — upload avatar image
router.post('/me/avatar', auth, avatarUpload.single('avatar'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'avatar image is required' });

  const avatarUrl = `/uploads/${req.file.filename}`;
  db.run('UPDATE users SET avatar_url = ? WHERE id = ?', [avatarUrl, req.user.id]);

  const user = db.get('SELECT id, full_name, avatar_url FROM users WHERE id = ?', [req.user.id]);
  res.json({ user: { id: user.id, full_name: user.full_name, avatar_url: user.avatar_url } });
});

// GET /auth/users/:id — get a single user's public profile
router.get('/users/:id', auth, (req, res) => {
  const user = db.get(
    'SELECT id, full_name, avatar_url, created_at FROM users WHERE id = ?',
    [parseInt(req.params.id, 10)]
  );
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
});

// GET /auth/users — list all registered users
router.get('/users', auth, (req, res) => {
  const users = db.all(
    'SELECT id, full_name, avatar_url, created_at FROM users ORDER BY created_at ASC'
  );
  res.json({ users });
});

module.exports = router;
