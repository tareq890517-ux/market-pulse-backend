const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');

const router = express.Router();

function makeToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

router.post('/signup', async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'الاسم والبريد وكلمة المرور مطلوبة' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' });
  }

  try {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'يوجد حساب مسجّل بهذا البريد مسبقاً' });
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const result = await pool.query(
      'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
      [name, email.toLowerCase(), passwordHash]
    );
    const userId = result.rows[0].id;

    const token = makeToken(userId);
    res.status(201).json({
      token,
      user: { id: userId, name, email, is_subscribed: false, analysis_count: 0 },
    });
  } catch (err) {
    console.error('خطأ التسجيل:', err.message);
    res.status(500).json({ error: 'حدث خطأ غير متوقع، حاول مرة أخرى' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'البريد وكلمة المرور مطلوبان' });
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    const user = result.rows[0];
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
    }

    const token = makeToken(user.id);
    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        is_subscribed: !!user.is_subscribed,
        analysis_count: user.analysis_count,
      },
    });
  } catch (err) {
    console.error('خطأ الدخول:', err.message);
    res.status(500).json({ error: 'حدث خطأ غير متوقع، حاول مرة أخرى' });
  }
});

module.exports = router;
