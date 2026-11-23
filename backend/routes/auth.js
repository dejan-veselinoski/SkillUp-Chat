const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const db      = require('../db');

const router     = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

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

  const user = { id: lastInsertRowid, full_name: full_name.trim() };
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
    user: { id: user.id, full_name: user.full_name }
  });
});

module.exports = router;
