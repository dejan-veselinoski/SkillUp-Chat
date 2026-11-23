require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');
const { initDb } = require('./db');

const authRoutes    = require('./routes/auth');
const messageRoutes = require('./routes/messages');

const app  = express();
const PORT = process.env.PORT || 3000;

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(uploadsDir));
app.use('/docs', express.static(path.join(__dirname, 'docs')));

app.use('/auth',     authRoutes);
app.use('/messages', messageRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

async function main() {
  await initDb();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SkillUp Chat API running on http://0.0.0.0:${PORT}`);
  });
}

main().catch(err => { console.error(err); process.exit(1); });
