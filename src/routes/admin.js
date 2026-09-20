const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

async function requireAdmin(req, res, next) {
  const result = await pool.query('SELECT email FROM users WHERE id = $1', [req.userId]);
  const user = result.rows[0];
  const adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase();
  if (!user || !adminEmail || user.email.toLowerCase() !== adminEmail) {
    return res.status(403).json({ error: 'هذه الصفحة للمالك فقط' });
  }
  next();
}

router.get('/stats', requireAuth, requireAdmin, async (req, res) => {
  try {
    const totalUsersResult = await pool.query('SELECT COUNT(*) AS c FROM users');
    const subscribedResult = await pool.query('SELECT COUNT(*) AS c FROM users WHERE is_subscribed = 1');
    const totalAnalysesResult = await pool.query('SELECT SUM(analysis_count) AS s FROM users');
    const recentUsersResult = await pool.query(
      'SELECT id, name, email, analysis_count, is_subscribed, created_at FROM users ORDER BY created_at DESC LIMIT 50'
    );

    res.json({
      total_users: parseInt(totalUsersResult.rows[0].c, 10),
      subscribed_users: parseInt(subscribedResult.rows[0].c, 10),
      total_analyses: parseInt(totalAnalysesResult.rows[0].s, 10) || 0,
      recent_users: recentUsersResult.rows,
    });
  } catch (err) {
    console.error('خطأ stats:', err.message);
    res.status(500).json({ error: 'حدث خطأ غير متوقع' });
  }
});

router.get('/subscriptions', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT sr.id, sr.method, sr.tx_hash, sr.status, sr.created_at, u.id AS user_id, u.name, u.email
       FROM subscription_requests sr
       JOIN users u ON u.id = sr.user_id
       ORDER BY sr.created_at DESC`
    );
    res.json({ requests: result.rows });
  } catch (err) {
    console.error('خطأ subscriptions:', err.message);
    res.status(500).json({ error: 'حدث خطأ غير متوقع' });
  }
});

router.post('/subscriptions/:id/approve', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM subscription_requests WHERE id = $1', [req.params.id]);
    const request = result.rows[0];
    if (!request) return res.status(404).json({ error: 'الطلب غير موجود' });

    await pool.query("UPDATE subscription_requests SET status = 'approved' WHERE id = $1", [request.id]);
    await pool.query('UPDATE users SET is_subscribed = 1 WHERE id = $1', [request.user_id]);

    res.json({ message: 'تم تفعيل الاشتراك' });
  } catch (err) {
    console.error('خطأ approve:', err.message);
    res.status(500).json({ error: 'حدث خطأ غير متوقع' });
  }
});

router.post('/subscriptions/:id/reject', requireAuth, requireAdmin, async (req, res) => {
  try {
    await pool.query("UPDATE subscription_requests SET status = 'rejected' WHERE id = $1", [req.params.id]);
    res.json({ message: 'تم رفض الطلب' });
  } catch (err) {
    console.error('خطأ reject:', err.message);
    res.status(500).json({ error: 'حدث خطأ غير متوقع' });
  }
});

router.post('/users/:id/revoke', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT id FROM users WHERE id = $1', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'المستخدم غير موجود' });

    await pool.query('UPDATE users SET is_subscribed = 0 WHERE id = $1', [req.params.id]);
    res.json({ message: 'تم إلغاء الاشتراك' });
  } catch (err) {
    console.error('خطأ revoke:', err.message);
    res.status(500).json({ error: 'حدث خطأ غير متوقع' });
  }
});

router.delete('/users/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, email FROM users WHERE id = $1', [req.params.id]);
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

    const adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase();
    if (user.email.toLowerCase() === adminEmail) {
      return res.status(400).json({ error: 'لا يمكن حذف حساب المالك' });
    }

    await pool.query('DELETE FROM subscription_requests WHERE user_id = $1', [req.params.id]);
    await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    res.json({ message: 'تم حذف الحساب' });
  } catch (err) {
    console.error('خطأ delete:', err.message);
    res.status(500).json({ error: 'حدث خطأ غير متوقع' });
  }
});

module.exports = router;
