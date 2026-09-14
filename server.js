require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./src/routes/auth');
const pricesRoutes = require('./src/routes/prices');
const analyzeRoutes = require('./src/routes/analyze');
const meRoutes = require('./src/routes/me');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' })); // نسمح بحجم أكبر لأن صور الشارت تُرسَل base64

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/prices', pricesRoutes);
app.use('/api/analyze', analyzeRoutes);
app.use('/api/me', meRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ السيرفر يعمل على http://localhost:${PORT}`);
});
