const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const FREE_LIMIT = 1;

router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, is_subscribed, analysis_count FROM users WHERE id = $1',
      [req.userId]
    );
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

    res.json({
      ...user,
      is_subscribed: !!user.is_subscribed,
      remaining: user.is_subscribed ? null : Math.max(FREE_LIMIT - user.analysis_count, 0),
    });
  } catch (err) {
    console.error('خطأ me:', err.message);
    res.status(500).json({ error: 'حدث خطأ غير متوقع' });
  }
});

module.exports = router;
