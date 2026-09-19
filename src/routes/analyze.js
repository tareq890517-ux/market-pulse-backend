const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const FREE_LIMIT = 2;

const SYSTEM_PROMPT = `أنت محلل فني محترف للأسواق المالية (كريبتو، فوركس، أسهم). ستستلم صورة واحدة أو عدة صور لنفس الأصل، كل صورة مسبوقة بنص يحدد فريمها الزمني (مثل: 5m, 15m, 1h, 4h, 1D, 1W). إذا استلمت أكثر من فريم، ادمج قراءتك عبر الفريمات: الفريم الأكبر (يوم/أسبوع) يحدد الاتجاه العام الأقوى، والفريم الأصغر (5 دقائق/15 دقيقة/ساعة) يفيد بتوقيت الدخول الدقيق.

قواعد صارمة:
1. اعتمد فقط على ما هو ظاهر فعلياً بالصور. لا تخترع رقماً غير مقروء بوضوح — اكتب "غير واضح من الصورة" بدلاً من ذلك.
2. احسب مستويات فيبوناتشي تقريبية (23.6%, 38.2%, 50%, 61.8%) بين أعلى قمة وأدنى قاع واضحين، واذكر أقرب مستوى فعال حالياً.
3. إن وجدت مؤشرات فنية مرسومة (متوسطات متحركة، RSI، MACD، بولينجر) استخدمها واذكرها. إن لم توجد، اعتمد على حركة السعر فقط.
4. مستويات الدخول والخروج يجب أن تكون منطقية رياضياً بالنسبة للدعم والمقاومة وفيبوناتشي الفعليين.
5. لا تخترع أي نسبة "احتمال نجاح الصفقة" — غير قابل للحساب من صور ثابتة. بدلاً من ذلك صنّف مستوى الخطورة بوضوح.

أجب فقط بكائن JSON صالح بالضبط، بدون أي نص إضافي ولا Markdown:
{
  "pattern": "اسم النمط الفني بالعربية، أو 'غير واضح من الصورة'",
  "timeframes_summary": "ملخص قراءة كل فريم تم رفعه وكيف أثر على القرار العام (اذكر كل فريم بالاسم)",
  "overall_trend": "الاتجاه العام المدمج من كل الفريمات المتوفرة (صاعد/هابط/عرضي) مع وصف قصير",
  "fibonacci_level": "أقرب مستوى فيبوناتشي فعال حالياً كرقم أو نسبة",
  "indicators_used": "المؤشرات الفنية المستخدمة إن وُجدت، وإلا 'حركة السعر فقط'",
  "support": "أقرب مستوى دعم ظاهر فعلياً",
  "resistance": "أقرب مستوى مقاومة ظاهر فعلياً",
  "entry": "سعر دخول منطقي رياضياً",
  "stop_loss": "سعر وقف خسارة منطقي",
  "take_profit": "سعر جني أرباح واقعي",
  "risk_level": "منخفضة أو متوسطة أو عالية، حسب وضوح النمط والتقلب واتفاق الفريمات مع بعضها",
  "risk_reward": "نسبة محسوبة فعلياً مثل 1:2.5",
  "risk_reward_label": "good أو warn أو bad",
  "confidence": "درجة ثقة بوضوح النمط والمستويات كنسبة مئوية تقريبية",
  "risk_factors": ["عامل خطر أول", "عامل خطر ثاني", "عامل خطر ثالث إن وجد"]
}`;

router.post('/', requireAuth, async (req, res) => {
  const { images } = req.body;
  const list = Array.isArray(images) && images.length > 0
    ? images
    : (req.body.imageBase64 ? [{ imageBase64: req.body.imageBase64, mediaType: req.body.mediaType, label: '' }] : []);

  if (list.length === 0) {
    return res.status(400).json({ error: 'لم تُرسَل أي صورة' });
  }
  if (list.length > 6) {
    return res.status(400).json({ error: 'الحد الأقصى 6 فريمات بالتحليل الواحد' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

  if (!user.is_subscribed && user.analysis_count >= FREE_LIMIT) {
    return res.status(402).json({
      error: 'انتهت تحليلاتك المجانية',
      requiresSubscription: true,
    });
  }

  try {
    const parts = [{ text: SYSTEM_PROMPT + `\n\nعدد الفريمات المرفقة: ${list.length}. حلّل بدقة وأعد النتيجة بصيغة JSON فقط.` }];
    list.forEach((im) => {
      parts.push({ text: `الفريم الزمني للصورة التالية: ${im.label || 'غير محدد'}` });
      parts.push({ inline_data: { mime_type: im.mediaType || 'image/png', data: im.imageBase64 } });
    });

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
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
