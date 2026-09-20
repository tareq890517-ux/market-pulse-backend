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
    .prepare('SELECT id, name, email, analysis_count, is_subscribed, created_at FROM users ORDER BY created_at DESC LIMIT 50')
    .all();

  res.json({
    total_users: totalUsers,
    subscribed_users: subscribedUsers,
    total_analyses: totalAnalyses,
    recent_users: recentUsers,
  });
});

router.get('/subscriptions', requireAuth, requireAdmin, (req, res) => {
  const all = db
    .prepare(
      `SELECT sr.id, sr.method, sr.tx_hash, sr.status, sr.created_at, u.id AS user_id, u.name, u.email
       FROM subscription_requests sr
       JOIN users u ON u.id = sr.user_id
       ORDER BY sr.created_at DESC`
    )
    .all();
  res.json({ requests: all });
});

router.post('/subscriptions/:id/approve', requireAuth, requireAdmin, (req, res) => {
  const request = db.prepare('SELECT * FROM subscription_requests WHERE id = ?').get(req.params.id);
  if (!request) return res.status(404).json({ error: 'الطلب غير موجود' });

  db.prepare("UPDATE subscription_requests SET status = 'approved' WHERE id = ?").run(request.id);
  db.prepare('UPDATE users SET is_subscribed = 1 WHERE id = ?').run(request.user_id);

  res.json({ message: 'تم تفعيل الاشتراك' });
});

router.post('/subscriptions/:id/reject', requireAuth, requireAdmin, (req, res) => {
  db.prepare("UPDATE subscription_requests SET status = 'rejected' WHERE id = ?").run(req.params.id);
  res.json({ message: 'تم رفض الطلب' });
});

router.post('/users/:id/revoke', requireAuth, requireAdmin, (req, res) => {
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

  db.prepare('UPDATE users SET is_subscribed = 0 WHERE id = ?').run(req.params.id);
  res.json({ message: 'تم إلغاء الاشتراك' });
});

router.delete('/users/:id', requireAuth, requireAdmin, (req, res) => {
  const user = db.prepare('SELECT id, email FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

  const adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase();
  if (user.email.toLowerCase() === adminEmail) {
    return res.status(400).json({ error: 'لا يمكن حذف حساب المالك' });
  }

  db.prepare('DELETE FROM subscription_requests WHERE user_id = ?').run(req.params.id);
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ message: 'تم حذف الحساب' });
});

module.exports = router;
