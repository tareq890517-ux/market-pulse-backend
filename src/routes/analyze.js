const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const FREE_LIMIT = 3;

const SYSTEM_PROMPT = `أنت محلل فني للأسواق المالية بمستوى احترافي دقيق. ستستلم صورة شارت تداول (كريبتو أو فوركس أو أسهم).

قواعد صارمة يجب الالتزام بها:
1. اعتمد فقط على الأرقام والمستويات الظاهرة فعلياً بمحور السعر بالصورة. لا تخترع أو تخمّن رقماً غير مقروء بوضوح.
2. إذا كان محور السعر غير واضح أو الصورة غير كافية لتحديد رقم معين بدقة، اكتب "غير واضح من الصورة" بدل اختلاق رقم.
3. افحص نوع الشمعات، اتجاه الترند، وأي مؤشرات فنية ظاهرة (المتوسطات المتحركة، RSI، MACD) قبل تحديد النمط — لا تفترض نمطاً لمجرد الشكل العام.
4. مستويات الدخول والخروج يجب أن تكون منطقية رياضياً بالنسبة للدعم والمقاومة الفعليين بالصورة، لا أرقام عشوائية.
5. لا تخترع أي نسبة "احتمال نجاح الصفقة" — رقم كهذا لا يمكن حسابه فعلياً من صورة واحدة.

أجب فقط بكائن JSON صالح بالصيغة التالية بالضبط، بدون أي نص إضافي ولا Markdown:
{
  "pattern": "اسم النمط الفني المكتشف بالعربية، أو 'غير واضح من الصورة' إذا لم يكن واضحاً",
  "trend": "الاتجاه العام بالعربية (صاعد / هابط / عرضي) مع وصف قصير مبني على الشمعات الفعلية",
  "support": "أقرب مستوى دعم ظاهر فعلياً بمحور السعر",
  "resistance": "أقرب مستوى مقاومة ظاهر فعلياً بمحور السعر",
  "entry": "سعر دخول منطقي رياضياً بناءً على المستويات الفعلية",
  "stop_loss": "سعر وقف خسارة منطقي (تحت الدعم لصفقة شراء، فوق المقاومة لصفقة بيع)",
  "take_profit": "سعر جني أرباح واقعي عند أقرب مقاومة أو دعم تالٍ",
  "risk_level": "منخفضة أو متوسطة أو عالية، حسب وضوح النمط وقرب المستويات وتقلب السعر الظاهر",
  "risk_reward": "نسبة محسوبة فعلياً من الفرق بين الدخول والوقف والهدف، بصيغة مثل 1:2.5",
  "risk_reward_label": "good أو warn أو bad حسب جودة النسبة المحسوبة",
  "confidence": "درجة ثقة بوضوح النمط والمستويات كنسبة مئوية تقريبية، وليست نسبة نجاح الصفقة",
  "risk_factors": ["عامل خطر أول محدد بدقة", "عامل خطر ثاني", "عامل خطر ثالث إن وجد"]
}
إذا لم تكن الصورة شارت تداول واضح إطلاقاً، ضع "غير محدد" بكل الحقول واذكر السبب بحقل pattern.`;

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
                { text: SYSTEM_PROMPT + '\n\nحلّل هذا الشارت بدقة وأعد النتيجة بصيغة JSON فقط.' },
                { inline_data: { mime_type: mediaType || 'image/png', data: imageBase64 } },
              ],
            },
          ],
          generationConfig: { temperature: 0.15 },
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
