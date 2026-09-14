const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const FREE_LIMIT = 3;

const SYSTEM_PROMPT = `أنت محلل فني للأسواق المالية. ستستلم صورة شارت تداول (كريبتو أو فوركس أو أسهم).
حلّل الصورة وأجب فقط بكائن JSON صالح بالصيغة التالية بالضبط، بدون أي نص إضافي ولا Markdown:
{
  "pattern": "اسم النمط الفني المكتشف بالعربية",
  "trend": "الاتجاه العام بالعربية (صاعد / هابط / عرضي) مع وصف قصير",
  "support": "أقرب مستوى دعم كرقم أو نطاق",
  "resistance": "أقرب مستوى مقاومة كرقم أو نطاق",
  "risk_reward": "نسبة تقريبية بصيغة مثل 1:2.5",
  "risk_reward_label": "good أو warn أو bad حسب جودة النسبة",
  "confidence": "درجة ثقة النمط كنسبة مئوية تقريبية",
  "risk_factors": ["عامل خطر أول", "عامل خطر ثاني", "عامل خطر ثالث إن وجد"]
}
إذا لم تكن الصورة شارت تداول واضح، وضّح ذلك في حقل pattern وضع باقي الحقول "غير محدد".`;

router.post('/', requireAuth, async (req, res) => {
  const { imageBase64, mediaType } = req.body;
  if (!imageBase64) {
    return res.status(400).json({ error: 'لم تُرسَل صورة' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

  if (!user.is_subscribed && user.analysis_count >= FREE_LIMIT) {
    return res.status(402).json({
      error: 'انتهت تحليلاتك المجانية الثلاث',
      requiresSubscription: true,
    });
  }

  try {
    const response = await fetch('
