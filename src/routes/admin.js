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
    res.status(500).json({ error: 'حدث خطأ غ
