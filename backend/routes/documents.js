const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const auth    = require('../middleware/auth');
const db      = require('../db');

const router = express.Router();

const docsDir = path.join(__dirname, '..', 'uploads', 'documents');
if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: docsDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 9)}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }
});

// GET /documents
router.get('/', auth, (req, res) => {
  const rows = db.all(
    `SELECT d.id, d.original_name, d.file_url, d.file_size, d.mime_type,
            d.description, d.created_at, u.id AS user_id, u.full_name
     FROM documents d
     JOIN users u ON d.user_id = u.id
     ORDER BY d.created_at DESC`
  );
  res.json({
    documents: rows.map(r => ({
      id:            r.id,
      original_name: r.original_name,
      file_url:      r.file_url,
      file_size:     r.file_size,
      mime_type:     r.mime_type,
      description:   r.description,
      created_at:    r.created_at,
      uploader:      { id: r.user_id, full_name: r.full_name }
    }))
  });
});

// POST /documents/upload
router.post('/upload', auth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file is required' });

  const description = req.body.description ? req.body.description.trim() : null;
  const fileUrl     = `/uploads/documents/${req.file.filename}`;

  const { lastInsertRowid } = db.run(
    `INSERT INTO documents (user_id, original_name, stored_name, file_url, file_size, mime_type, description)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [req.user.id, req.file.originalname, req.file.filename,
     fileUrl, req.file.size, req.file.mimetype, description]
  );

  const row = db.get(
    `SELECT d.id, d.original_name, d.file_url, d.file_size, d.mime_type,
            d.description, d.created_at, u.id AS user_id, u.full_name
     FROM documents d JOIN users u ON d.user_id = u.id WHERE d.id = ?`,
    [lastInsertRowid]
  );

  res.status(201).json({
    id:            row.id,
    original_name: row.original_name,
    file_url:      row.file_url,
    file_size:     row.file_size,
    mime_type:     row.mime_type,
    description:   row.description,
    created_at:    row.created_at,
    uploader:      { id: row.user_id, full_name: row.full_name }
  });
});

// DELETE /documents/:id
router.delete('/:id', auth, (req, res) => {
  const docId = parseInt(req.params.id, 10);
  const doc   = db.get('SELECT * FROM documents WHERE id = ?', [docId]);

  if (!doc)                        return res.status(404).json({ error: 'Document not found' });
  if (doc.user_id !== req.user.id) return res.status(403).json({ error: 'Not allowed' });

  const filePath = path.join(docsDir, doc.stored_name);
  try { fs.unlinkSync(filePath); } catch {}

  db.run('DELETE FROM documents WHERE id = ?', [docId]);
  res.json({ deleted: true });
});

module.exports = router;
