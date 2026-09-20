const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/', requireAuth, (req, res) => {
  const { method, tx_hash } = req.body;
  if (!method || !tx_hash) {
    return res.status(400).json({ error: 'يلزم تحديد طريقة الدفع ورقم العملية' });
  }
  if (!['BTC', 'USDT'].includes(method)) {
    return res.status(400).json({ error: 'طريقة دفع غير مدعومة' });
  }

  db.prepare('INSERT INTO subscription_requests (user_id, method, tx_hash) VALUES (?, ?, ?)').run(
    req.userId,
    method,
    tx_hash.trim()
  );

  res.status(201).json({ message: 'تم استلام طلبك، سيتم تفعيل الاشتراك بعد التحقق من التحويل' });
});

module.exports = router;
