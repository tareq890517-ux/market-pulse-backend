const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function requireAdmin(req, res, next) {
  const user = db.prepare('SELECT email FROM users WHERE id = ?').get(req.userId);
  const adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase();
  if (!user || !adminEmail || user.email.toLowerCase() !== adminEmail) {
    return res.status(403).json({ error: 'هذه الصفحة للمالك فقط' });
  }
  next();
}

router.get('/stats', requireAuth, requireAdmin, (req, res) => {
  const totalUsers = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  const subscribedUsers = db.prepare('SELECT COUNT(*) AS c FROM users WHERE is_subscribed = 1').get().c;
  const totalAnalyses = db.prepare('SELECT SUM(analysis_count) AS s FROM users').get().s || 0;
  const recentUsers = db
    .prepare('SELECT name, email, analysis_count, is_subscribed, created_at FROM users ORDER BY created_at DESC LIMIT 20')
    .all();

  res.json({
    total_users: totalUsers,
    subscribed_users: subscribedUsers,
    total_analyses: totalAnalyses,
    recent_users: recentUsers,
  });
});

module.exports = router;
