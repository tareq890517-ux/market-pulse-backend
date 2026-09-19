const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const FREE_LIMIT = 3;

const SYSTEM_PROMPT = `أنت محلل فني للأسواق المالية. ستستلم صورة شارت تداول (كريبتو أو فوركس أو أسهم).
حلّل الصورة وأجب فقط بكائن JSON صالح بالصيغة التالية بالضبط، بدون أي نص إضافي ولا Markdown، وبدون علامات الاقتباس الثلاثية:
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
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: SYSTEM_PROMPT + '\n\nحلّل هذا الشارت وأعد النتيجة بصيغة JSON فقط.' },
                { inline_data: { mime_type: mediaType || 'image/png', data: imageBase64 } },
              ],
            },
          ],
        }),
      }
    );

    const data = await geminiRes.json();
    if (!geminiRes.ok) {
      console.error('خطأ من Gemini API:', data);
      return res.status(502).json({ error: 'تعذّر تحليل الصورة حالياً' });
    }

    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const clean = rawText.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    db.prepare('UPDATE users SET analysis_count = analysis_count + 1 WHERE id = ?').run(user.id);
    const updated = db.prepare('SELECT analysis_count, is_subscribed FROM users WHERE id = ?').get(user.id);

    res.json({
      analysis: parsed,
      remaining: updated.is_subscribed ? null : Math.max(FREE_LIMIT - updated.analysis_count, 0),
    });
  } catch (err) {
    console.error('فشل تحليل الشارت:', err.message);
    res.status(500).json({ error: 'حدث خطأ غير متوقع أثناء التحليل' });
  }
});

module.exports = router;
