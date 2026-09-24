const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const FREE_LIMIT = 1;

const SYSTEM_PROMPT = `أنت محلل فني محترف للأسواق المالية (كريبتو، فوركس، أسهم). ستستلم صورة واحدة أو عدة صور لنفس الأصل، كل صورة مسبوقة بنص يحدد فريمها الزمني (مثل: 5m, 15m, 1h, 4h, 1D, 1W). إذا استلمت أكثر من فريم، ادمج قراءتك عبر الفريمات: الفريم الأكبر (يوم/أسبوع) يحدد الاتجاه العام الأقوى، والفريم الأصغر (5 دقائق/15 دقيقة/ساعة) يفيد بتوقيت الدخول الدقيق.

قاعدة إلزامية بخصوص اتجاه الصفقة — اقرأها بعناية:
أولاً حدد الاتجاه العام الفعلي من حركة السعر: هل هو صاعد، هابط، أم عرضي؟
- إذا كان الاتجاه هابطاً (قمم وقيعان متناقصة، كسر دعم، شموع حمراء مهيمنة): الصفقة المنطقية هي "بيع" (Short/Sell). في هذه الحالة: سعر الدخول عند مستوى مقاومة أو ارتداد، وقف الخسارة يكون فوق سعر الدخول، وجني الأرباح يكون تحت سعر الدخول عند أقرب دعم.
- إذا كان الاتجاه صاعداً (قمم وقيعان متزايدة، كسر مقاومة، شموع خضراء مهيمنة): الصفقة المنطقية هي "شراء" (Long/Buy). وقف الخسارة تحت سعر الدخول، وجني الأرباح فوق سعر الدخول عند أقرب مقاومة.
- إذا كان الاتجاه عرضياً بدون كسر واضح: اختر الاتجاه الأقرب للتحقق (بيع عند أعلى النطاق، شراء عند أسفله) وضح ذلك بحقل pattern.
لا تفترض "شراء" تلقائياً — حلّل الاتجاه الفعلي أولاً ثم حدد نوع الصفقة بناءً عليه فقط.

قواعد صارمة أخرى:
1. اعتمد فقط على ما هو ظاهر فعلياً بالصور. لا تخترع رقماً غير مقروء بوضوح — اكتب "غير واضح من الصورة" بدلاً من ذلك.
2. احسب مستويات فيبوناتشي تقريبية (23.6%, 38.2%, 50%, 61.8%) بين أعلى قمة وأدنى قاع واضحين، واذكر أقرب مستوى فعال حالياً.
3. إن وجدت مؤشرات فنية مرسومة (متوسطات متحركة، RSI، MACD، بولينجر) استخدمها واذكرها. إن لم توجد، اعتمد على حركة السعر فقط.
4. لا تخترع أي نسبة "احتمال نجاح الصفقة" — غير قابل للحساب من صور ثابتة. بدلاً من ذلك صنّف مستوى الخطورة بوضوح.

حساب درجة الثقة (confidence) — رقم متغيّر فعلياً حسب هذه المعايير:
- ابدأ من 50 كنقطة أساس.
- أضف حتى +20 إذا كانت أرقام محور السعر واضحة ومقروءة تماماً. اخصم حتى -20 إذا لم تكن كذلك.
- أضف حتى +15 إذا كان النمط الفني كلاسيكي وواضح الشكل. اخصم حتى -15 إذا كانت حركة السعر عشوائية.
- أضف حتى +15 إذا اتفقت كل الفريمات المرفوعة على نفس الاتجاه. اخصم حتى -15 إذا تعارضت.
- أضف حتى +10 إذا وُجدت مؤشرات فنية تدعم القراءة.
- الناتج بين 15 و95 فقط.

أجب فقط بكائن JSON صالح بالضبط، بدون أي نص إضافي ولا Markdown ولا علامات اقتباس ثلاثية:
{
  "trade_direction": "شراء أو بيع",
  "pattern": "اسم النمط الفني بالعربية، أو 'غير واضح من الصورة'",
  "timeframes_summary": "ملخص قراءة كل فريم تم رفعه",
  "overall_trend": "الاتجاه العام المدمج (صاعد/هابط/عرضي) مع وصف قصير",
  "fibonacci_level": "أقرب مستوى فيبوناتشي فعال حالياً",
  "indicators_used": "المؤشرات الفنية المستخدمة إن وُجدت، وإلا 'حركة السعر فقط'",
  "support": "أقرب مستوى دعم ظاهر فعلياً",
  "resistance": "أقرب مستوى مقاومة ظاهر فعلياً",
  "entry": "سعر دخول منطقي يطابق نوع الصفقة",
  "stop_loss": "سعر وقف خسارة يطابق نوع الصفقة",
  "take_profit": "سعر جني أرباح يطابق نوع الصفقة",
  "risk_level": "منخفضة أو متوسطة أو عالية",
  "risk_reward_label": "good أو warn أو bad",
  "confidence": "رقم محسوب فعلياً حسب المعايير أعلاه، بصيغة 'XX%'",
  "confidence_reasoning": "جملة قصيرة توضح سبب هذا الرقم",
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
  if (list.length > 1) {
    return res.status(400).json({ error: 'الحد الأقصى صورة واحدة بالتحليل الواحد' });
  }

  try {
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [req.userId]);
    const user = userResult.rows[0];
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

    const isAdmin = (process.env.ADMIN_EMAIL || '').toLowerCase() === (user.email || '').toLowerCase();

    if (!isAdmin && !user.is_subscribed && user.analysis_count >= FREE_LIMIT) {
      return res.status(402).json({
        error: 'انتهت تحليلاتك المجانية',
        requiresSubscription: true,
      });
    }

    const content = [
      { type: 'text', text: SYSTEM_PROMPT + `\n\nعدد الفريمات المرفقة: ${list.length}. حلّل بدقة وأعد النتيجة بصيغة JSON فقط.` },
    ];
    list.forEach((im) => {
      content.push({ type: 'text', text: `الفريم الزمني للصورة التالية: ${im.label || 'غير محدد'}` });
      content.push({
        type: 'image_url',
        image_url: { url: `data:${im.mediaType || 'image/png'};base64,${im.imageBase64}` },
      });
    });

    const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
    let apiRes, data;
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      apiRes = await fetch(GROQ_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'qwen/qwen3.8-27b',
          messages: [{ role: 'user', content }],
          max_tokens: 900,
        }),
      });

      data = await apiRes.json();

      if (apiRes.ok) break;

      console.error(`خطأ من Groq API (محاولة ${attempt}/${maxAttempts}):`, data);
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, attempt * 1500));
        continue;
      }
      return res.status(502).json({ error: 'تعذّر تحليل الصورة حالياً، حاول مرة أخرى' });
    }

    const rawText = data.choices?.[0]?.message?.content || '{}';
    const clean = rawText.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    await pool.query('UPDATE users SET analysis_count = analysis_count + 1 WHERE id = $1', [user.id]);
    const updatedResult = await pool.query('SELECT analysis_count, is_subscribed FROM users WHERE id = $1', [user.id]);
    const updated = updatedResult.rows[0];

    res.json({
      analysis: parsed,
      remaining: (isAdmin || updated.is_subscribed) ? null : Math.max(FREE_LIMIT - updated.analysis_count, 0),
    });
  } catch (err) {
    console.error('فشل تحليل الشارت:', err.message);
    res.status(500).json({ error: 'حدث خطأ غير متوقع أثناء التحليل' });
  }
});

module.exports = router;
