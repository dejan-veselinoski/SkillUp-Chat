const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const auth    = require('../middleware/auth');
const db      = require('../db');

const router = express.Router();

const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 9)}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Only image files are allowed'));
    cb(null, true);
  }
});

const ALLOWED_DOC_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
];

const docUpload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_DOC_TYPES.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Only PDF, Word (.doc/.docx), and plain text files are allowed'));
  }
});

function formatMessage(row, reactions = []) {
  return {
    id:         row.id,
    content:    row.content,
    type:       row.type,
    photo_url:  row.photo_url,
    file_name:  row.file_name || null,
    created_at: row.created_at,
    user:       { id: row.user_id, full_name: row.full_name, avatar_url: row.avatar_url || null },
    reactions
  };
}

function attachReactions(messages) {
  if (!messages.length) return messages;

  const ids          = messages.map(m => m.id);
  const placeholders = ids.map(() => '?').join(',');
  const reactions    = db.all(
    `SELECT r.message_id, r.emoji, r.user_id, u.full_name
     FROM reactions r
     JOIN users u ON r.user_id = u.id
     WHERE r.message_id IN (${placeholders})`,
    ids
  );

  const byMsg = {};
  reactions.forEach(r => {
    if (!byMsg[r.message_id]) byMsg[r.message_id] = [];
    byMsg[r.message_id].push({ emoji: r.emoji, user_id: r.user_id, full_name: r.full_name });
  });

  return messages.map(m => ({ ...m, reactions: byMsg[m.id] || [] }));
}

// GET /messages
router.get('/', auth, (req, res) => {
  const { since, limit = 100 } = req.query;
  let rows;

  if (since) {
    rows = db.all(
      `SELECT m.id, m.content, m.type, m.photo_url, m.file_name, m.created_at,
              u.id AS user_id, u.full_name, u.avatar_url
       FROM messages m JOIN users u ON m.user_id = u.id
       WHERE m.id > ?
       ORDER BY m.created_at ASC LIMIT ?`,
      [parseInt(since, 10), parseInt(limit, 10)]
    );
  } else {
    rows = db.all(
      `SELECT m.id, m.content, m.type, m.photo_url, m.file_name, m.created_at,
              u.id AS user_id, u.full_name, u.avatar_url
       FROM messages m JOIN users u ON m.user_id = u.id
       ORDER BY m.created_at ASC LIMIT ?`,
      [parseInt(limit, 10)]
    );
  }

  const messages = attachReactions(rows.map(r => formatMessage(r)));
  res.json({ messages });
});

// POST /messages — text message
router.post('/', auth, (req, res) => {
  const { content } = req.body;
  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'content is required' });
  }

  const { lastInsertRowid } = db.run(
    'INSERT INTO messages (user_id, content, type) VALUES (?, ?, ?)',
    [req.user.id, content.trim(), 'text']
  );

  const row = db.get(
    `SELECT m.id, m.content, m.type, m.photo_url, m.file_name, m.created_at,
            u.id AS user_id, u.full_name, u.avatar_url
     FROM messages m JOIN users u ON m.user_id = u.id WHERE m.id = ?`,
    [lastInsertRowid]
  );

  res.status(201).json(formatMessage(row, []));
});

// POST /messages/photo — photo message (multipart/form-data)
router.post('/photo', auth, upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'photo file is required' });

  const caption  = req.body.caption ? req.body.caption.trim() : null;
  const photoUrl = `/uploads/${req.file.filename}`;

  const { lastInsertRowid } = db.run(
    'INSERT INTO messages (user_id, content, type, photo_url) VALUES (?, ?, ?, ?)',
    [req.user.id, caption, 'photo', photoUrl]
  );

  const row = db.get(
    `SELECT m.id, m.content, m.type, m.photo_url, m.file_name, m.created_at,
            u.id AS user_id, u.full_name, u.avatar_url
     FROM messages m JOIN users u ON m.user_id = u.id WHERE m.id = ?`,
    [lastInsertRowid]
  );

  res.status(201).json(formatMessage(row, []));
});

// POST /messages/file — file attachment (PDF, Word, plain text)
router.post('/file', auth, docUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file is required' });

  const caption  = req.body.caption ? req.body.caption.trim() : null;
  const fileUrl  = `/uploads/${req.file.filename}`;
  const fileName = req.file.originalname;

  const { lastInsertRowid } = db.run(
    'INSERT INTO messages (user_id, content, type, photo_url, file_name) VALUES (?, ?, ?, ?, ?)',
    [req.user.id, caption, 'file', fileUrl, fileName]
  );

  const row = db.get(
    `SELECT m.id, m.content, m.type, m.photo_url, m.file_name, m.created_at,
            u.id AS user_id, u.full_name, u.avatar_url
     FROM messages m JOIN users u ON m.user_id = u.id WHERE m.id = ?`,
    [lastInsertRowid]
  );

  res.status(201).json(formatMessage(row, []));
});

// DELETE /messages/:id — delete a message (author only)
router.delete('/:id', auth, (req, res) => {
  const messageId = parseInt(req.params.id, 10);

  const message = db.get('SELECT id, user_id FROM messages WHERE id = ?', [messageId]);
  if (!message) return res.status(404).json({ error: 'Message not found' });
  if (message.user_id !== req.user.id) return res.status(403).json({ error: 'You can only delete your own messages' });

  db.run('DELETE FROM reactions WHERE message_id = ?', [messageId]);
  db.run('DELETE FROM messages WHERE id = ?', [messageId]);

  res.json({ message: 'Message deleted', id: messageId });
});

// POST /messages/:id/react — toggle emoji reaction
router.post('/:id/react', auth, (req, res) => {
  const messageId = parseInt(req.params.id, 10);
  const { emoji } = req.body;

  if (!emoji) return res.status(400).json({ error: 'emoji is required' });
  if (!db.get('SELECT id FROM messages WHERE id = ?', [messageId])) {
    return res.status(404).json({ error: 'Message not found' });
  }

  const existing = db.get(
    'SELECT id FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?',
    [messageId, req.user.id, emoji]
  );

  if (existing) {
    db.run('DELETE FROM reactions WHERE id = ?', [existing.id]);
    return res.json({ action: 'removed', emoji, message_id: messageId });
  }

  db.run(
    'INSERT INTO reactions (message_id, user_id, emoji) VALUES (?, ?, ?)',
    [messageId, req.user.id, emoji]
  );
  res.json({ action: 'added', emoji, message_id: messageId });
});

module.exports = router;
