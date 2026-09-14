const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const FREE_LIMIT = 3;

router.get('/', requireAuth, (req, res) => {
  const user = db
    .prepare('SELECT id, name, email, is_subscribed, analysis_count FROM users WHERE id = ?')
    .get(req.userId);

  if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

  res.json({
    ...user,
    is_subscribed: !!user.is_subscribed,
    remaining: user.is_subscribed ? null : Math.max(FREE_LIMIT - user.analysis_count, 0),
  });
});

module.exports = router;
