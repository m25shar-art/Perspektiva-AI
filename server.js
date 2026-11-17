require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'db.json');

app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
const upload = multer({ dest: uploadDir, limits: { fileSize: 10 * 1024 * 1024 } });

function readDB() {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ users: [], verificationCodes: {} }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

const transporter = process.env.SMTP_USER && process.env.SMTP_USER !== 'school-ai@yandex.ru'
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 465,
      secure: true,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })
  : null;

const TEXT_MODELS = {
  'ag/gemini-3.1-flash-lite-preview': {
    id: 'ag/gemini-3.1-flash-lite-preview',
    label: 'Быстрый (ag/gemini-3.1-flash-lite-preview)',
    price: 10,
  },
  'gpt-6.1-terra': {
    id: 'gpt-6.1-terra',
    label: 'Стандартный (GPT 6.1 Terra)',
    price: 20,
  },
  'cc/claude-sonnet-5-5': {
    id: 'cc/claude-sonnet-5-5',
    label: 'Экспертный (cc/claude-sonnet-5-5)',
    price: 40,
  },
};

const IMAGE_MODELS = {
  'am/flux.2-klein-4b(free)': {
    id: 'am/flux.2-klein-4b(free)',
    label: 'Базовый эскиз (am/flux.2-klein-4b(free))',
    price: 0,
  },
  'flow/nano-banana-2': {
    id: 'flow/nano-banana-2',
    label: 'Яркая иллюстрация (flow/nano-banana-2)',
    price: 20,
  },
  'anymedia/seedream-4': {
    id: 'anymedia/seedream-4',
    label: 'Для презентаций (anymedia/seedream-4)',
    price: 35,
  },
  'cx/gpt-image-2.5': {
    id: 'cx/gpt-image-2.5',
    label: 'Высокая точность (cx/gpt-image-2.5)',
    price: 50,
  },
};

const ASPECT_SIZES = {
  '16:9': '1344x768',
  '1:1': '1024x1024',
  '3:4': '768x1024',
};

function syncDailyCredits(user) {
  const today = new Date().toISOString().slice(0, 10);
  if (user.dailyDate !== today || typeof user.dailyCredits !== 'number') {
    user.dailyDate = today;
    user.dailyCredits = 1000;
  }
  if (typeof user.totalRequests !== 'number') user.totalRequests = 0;
  if (typeof user.tokensUsed !== 'number') user.tokensUsed = 0;
  if (typeof user.creditsSpentTotal !== 'number') user.creditsSpentTotal = 0;
  return user.dailyCredits;
}

app.post('/api/auth/send-code', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Введите email' });

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const db = readDB();
  db.verificationCodes[email] = { code, expires: Date.now() + 10 * 60 * 1000 };
  writeDB(db);

  try {
    if (transporter) {
      await transporter.sendMail({
        from: `"ЦО Перспектива ИИ" <${process.env.SMTP_USER}>`,
        to: email,
        subject: 'Код подтверждения регистрации — ЦО «Перспектива»',
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px;">
            <h2 style="color: #991B1B;">МБОУ «Центр образования "Перспектива"»</h2>
            <p>Ваш код подтверждения для регистрации на ИИ-портале учителей:</p>
            <div style="font-size: 28px; font-weight: bold; letter-spacing: 6px; color: #111; margin: 16px 0;">${code}</div>
            <p style="color: #666;">Код действителен 10 минут.</p>
          </div>
        `,
      });
    } else {
      console.log(`\n[DEV MODE] Код подтверждения для ${email}: ${code}\n`);
    }
    res.json({ success: true, message: 'Код отправлен на почту', devHint: !transporter ? `Код в консоли сервера (${code})` : null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка отправки письма' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  const { fullName, phone, email, emailCode, password, classes, subject } = req.body;
  const db = readDB();

  const savedCode = db.verificationCodes[email];
  if (!savedCode || savedCode.code !== emailCode || savedCode.expires < Date.now()) {
    return res.status(400).json({ error: 'Неверный или просроченный код подтверждения' });
  }

  if (db.users.find((u) => u.email === email)) {
    return res.status(400).json({ error: 'Пользователь с таким email уже зарегистрирован' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const today = new Date().toISOString().slice(0, 10);
  const newUser = {
    id: Date.now().toString(),
    fullName,
    phone,
    email,
    passwordHash,
    classes: classes || [],
    subject: subject || '',
    dailyDate: today,
    dailyCredits: 1000,
    totalRequests: 0,
    tokensUsed: 0,
    creditsSpentTotal: 0,
    createdAt: new Date().toISOString(),
  };

  db.users.push(newUser);
  delete db.verificationCodes[email];
  writeDB(db);

  const { passwordHash: _, ...safeUser } = newUser;
  res.json({ success: true, user: safeUser });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const db = readDB();
  const user = db.users.find((u) => u.email === email);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: 'Неверный email или пароль' });
  }
  syncDailyCredits(user);
  writeDB(db);
  const { passwordHash: _, ...safeUser } = user;
  res.json({ success: true, user: safeUser });
});

app.post('/api/auth/dev-login', (req, res) => {
  const db = readDB();
  let devUser = db.users.find((u) => u.email === 'dev@perspektiva.ru');
  const today = new Date().toISOString().slice(0, 10);
  if (!devUser) {
    devUser = {
      id: 'dev-teacher-1',
      fullName: 'Смирнова Елена Викторовна',
      phone: '+7 (999) 000-00-00',
      email: 'dev@perspektiva.ru',
      classes: [7, 8, 9],
      subject: 'Информатика',
      dailyDate: today,
      dailyCredits: 1000,
      totalRequests: 0,
      tokensUsed: 0,
      creditsSpentTotal: 0,
      createdAt: new Date().toISOString(),
    };
    db.users.push(devUser);
  } else {
    syncDailyCredits(devUser);
  }
  writeDB(db);
  const { passwordHash: _, ...safeUser } = devUser;
  res.json({ success: true, user: safeUser });
});

// Статистика для страницы разработчика
app.get('/api/dev/stats', (req, res) => {
  const db = readDB();
  const users = db.users.map((u) => {
    syncDailyCredits(u);
    return {
      id: u.id,
      fullName: u.fullName || '—',
      email: u.email || '—',
      phone: u.phone || '—',
      subject: u.subject || '—',
      classes: u.classes || [],
      totalRequests: u.totalRequests || 0,
      tokensUsed: u.tokensUsed || 0,
      creditsSpentTotal: u.creditsSpentTotal || 0,
      dailyCreditsRemaining: u.dailyCredits,
      createdAt: u.createdAt,
    };
  });
  res.json({ users });
});

app.post('/api/chat', upload.array('files', 5), async (req, res) => {
  try {
    const { userId, modelId, imageModelId, aspectRatio, messagesJson, mode } = req.body;
    const db = readDB();
    const user = db.users.find((u) => u.id === userId);
    if (!user) return res.status(401).json({ error: 'Пользователь не найден' });

    syncDailyCredits(user);

    const isImageMode = mode === 'image';
    const modelConfig = isImageMode
      ? (IMAGE_MODELS[imageModelId] || IMAGE_MODELS['am/flux.2-klein-4b(free)'])
      : (TEXT_MODELS[modelId] || TEXT_MODELS['gpt-6.1-terra']);

    const fixedPrice = modelConfig.price;
    if (user.dailyCredits < fixedPrice) {
      return res.status(403).json({
        error: `Недостаточно кредитов на сегодня (нужно ${fixedPrice} кр., осталось ${user.dailyCredits} кр.). Лимит обновится в 00:00.`,
      });
    }

    const messages = JSON.parse(messagesJson || '[]');
    const uploadedFiles = req.files || [];
    const baseUrl = (process.env.ANYMODEL_BASE_URL || 'https://anymodel.org/v1').replace(/\/+$/, '');
    const hasApiKey = process.env.ANYMODEL_API_KEY && process.env.ANYMODEL_API_KEY !== 'ваш_ключ_от_anymodel';

    const systemPrompt = {
      role: 'system',
      content: `Ты — интеллектуальный ассистент для учителей МБОУ «Центр образования "Перспектива"».
Собеседник: ${user.fullName}, предмет: ${user.subject}, классы: ${user.classes.join(', ')}.
Режим работы: ${mode === 'web' ? 'Веб-поиск (предоставляй актуальные факты и ссылки)' : 'Стандартный методический ассистент'}.
Отвечай структурированно, грамотно, с опорой на ФГОС РФ.`,
    };

    if (uploadedFiles.length > 0 && messages.length > 0) {
      const fileNames = uploadedFiles.map((f) => f.originalname).join(', ');
      messages[messages.length - 1].content += `\n\n[Прикреплённые файлы: ${fileNames}]`;
    }

    let replyText = '';
    let imageUrl = null;
    let requestTokens = 0;

    if (isImageMode) {
      const lastPrompt = messages[messages.length - 1]?.content || 'Учебная иллюстрация';
      const size = ASPECT_SIZES[aspectRatio] || '1024x1024';

      if (hasApiKey) {
        // Запрос на генерацию изображения (поддержка url и b64_json)
        const requestImage = async (payload) => {
          const r = await fetch(`${baseUrl}/images/generations`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${process.env.ANYMODEL_API_KEY}`,
            },
            body: JSON.stringify(payload),
          });
          return r.json();
        };

        let imgData = await requestImage({
          model: modelConfig.id,
          prompt: lastPrompt,
          n: 1,
          size,
        });

        // Если модель не приняла нестандартный size — пробуем стандартный 1024x1024
        if (imgData?.error && size !== '1024x1024') {
          imgData = await requestImage({
            model: modelConfig.id,
            prompt: lastPrompt,
            n: 1,
            size: '1024x1024',
          });
        }

        const firstItem = imgData?.data?.[0];
        if (firstItem?.url) {
          imageUrl = firstItem.url;
        } else if (firstItem?.b64_json) {
          imageUrl = `data:image/png;base64,${firstItem.b64_json}`;
        }

        if (imageUrl) {
          replyText = `Иллюстрация готова (${aspectRatio || '1:1'}) по запросу: «${lastPrompt}»`;
          requestTokens = 1000;
        } else {
          console.error('Ошибка генерации фото AnyModel:', imgData);
          const errMsg = imgData?.error?.message || JSON.stringify(imgData);
          return res.status(502).json({ error: `Не удалось сгенерировать фото: ${errMsg}` });
        }
      } else {
        const [w, h] = size.split('x');
        imageUrl = `https://placehold.co/${w}x${h}/991B1B/FFF?text=${encodeURIComponent(modelConfig.id + ' (' + (aspectRatio || '1:1') + ')')}`;
        replyText = `[Демо-режим] Сгенерирована иллюстрация (${aspectRatio || '1:1'}) по запросу: «${lastPrompt}».`;
        requestTokens = 1000;
      }
    } else {
      if (hasApiKey) {
        const apiRes = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.ANYMODEL_API_KEY}`,
          },
          body: JSON.stringify({
            model: modelConfig.id,
            messages: [systemPrompt, ...messages],
            web_search: mode === 'web',
          }),
        });
        const data = await apiRes.json();
        if (data?.error) {
          console.error('Ошибка текста AnyModel:', data);
          return res.status(502).json({ error: data.error.message || 'Ошибка модели' });
        }
        replyText = data?.choices?.[0]?.message?.content || 'Ошибка получения ответа от модели.';
        requestTokens = data?.usage?.total_tokens || Math.ceil(replyText.length / 3);
      } else {
        const lastMsg = messages[messages.length - 1]?.content || '';
        replyText = `**Ответ от ${modelConfig.label}** *(демо-режим)*:\n\nВы написали: *«${lastMsg}»*\n\n${
          mode === 'web' ? '🌐 *Режим веб-поиска активен: проверены актуальные образовательные ресурсы.*\n\n' : ''
        }Материал подготовлен с учётом профиля (${user.subject}, ${user.classes.join(', ')} кл.). Для подключения реальной нейросети укажите \`ANYMODEL_API_KEY\` в файле \`.env\`.`;
        requestTokens = Math.max(120, Math.ceil((lastMsg.length + replyText.length) / 3));
      }
    }

    // Обновляем статистику пользователя для панели разработчика
    user.dailyCredits = Math.max(0, user.dailyCredits - fixedPrice);
    user.totalRequests += 1;
    user.tokensUsed += requestTokens;
    user.creditsSpentTotal += fixedPrice;
    writeDB(db);

    res.json({
      reply: replyText,
      imageUrl,
      creditsSpent: fixedPrice,
      modelLabel: modelConfig.label,
      remainingCredits: user.dailyCredits,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

app.listen(PORT, () => {
  console.log(`Сервер запущен: http://localhost:${PORT}`);
});