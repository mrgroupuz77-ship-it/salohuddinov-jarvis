# DEPLOYMENT — Jarvis’ni ishga tushirish

Asosiy yo‘l — **to‘liq bepul**: Vercel Hobby (server) + Neon Free (baza) + Gemini bepul tarifi (model). Karta, domen yoki terminal kerak emas.

Pullik muqobillar (Railway, o‘z VPS’ingiz, Claude modeli) — pastda, B va C bo‘limlarida.

---

## 0. Nima bepul va qanday cheklovi bor

Holat: 2026-10-14 da rasmiy sahifalardan tekshirilgan. Tariflar o‘zgarishi mumkin — ulashdan oldin havolalarni qayta ko‘ring.

| Xizmat | Nima uchun | Bepul tarifda | Limit tugasa |
|---|---|---|---|
| Vercel Hobby | Server, `https://….vercel.app` manzil | Bepul. Cron: loyihaga 100 ta, har biri **kuniga 1 marta**, soat ichida istalgan daqiqada (±59 daqiqa). Workflow: oyiga 50 000 event. Funksiya: 5 daqiqagacha. Faqat shaxsiy, notijoriy foydalanish uchun ([Hobby](https://vercel.com/docs/plans/hobby), [Cron](https://vercel.com/docs/cron-jobs/usage-and-pricing), [Workflow](https://vercel.com/docs/workflows/pricing)) | Funksiya to‘xtaydi, 30 kundan keyin qayta ochiladi. Pul yechilmaydi |
| Neon Free | PostgreSQL baza | Karta kerak emas. Loyihaga 1 GB, 100 CU-soat. 5 daqiqa ishlatilmasa uxlaydi, keyingi so‘rovda uyg‘onadi ([Neon pricing](https://neon.com/pricing)) | Baza to‘xtaydi |
| Gemini API (Google AI Studio) | Model | `gemini-3.8-flash` bepul tarifda “Free of charge”. **Bepul tarifda Google ma’lumotlarni o‘z mahsulotlarini yaxshilash uchun ishlatadi** ([Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)). O‘zbekiston qo‘llab-quvvatlanadi ([regions](https://ai.google.dev/gemini-api/docs/available-regions)). So‘rov limitlari faqat AI Studio’da ko‘rsatiladi ([rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)) | Jarvis “bepul limit tugadi” deb yozadi. Buyruqlar (/today, /report, /status) modelsiz ishlayveradi |
| Telegram BotFather | Bot tokeni | Bepul | — |

Bepul tarif nimani anglatadi:
- **Hisobot vaqti.** Jarvis soatiga bir marta uyg‘onadi. 21:00 dagi hisobot 21:00–21:59 orasida keladi.
- **Maxfiylik.** Jarvis’ga parol, karta raqami yoki mijozning maxfiy ma’lumotini yozmang (bu qoida har doim amal qiladi).
- **Model sifati.** Gemini bilan o‘zbekcha kontent sifati haqiqiy suhbatda sinab ko‘riladi. Yoqmasa, 2 ta sozlamani almashtirib Claude’ga o‘tasiz (C bo‘lim).

---

## A. Bepul yo‘l: Vercel + Neon + Gemini

Claude o‘zi qiladi:
- Vercel’da `salohuddinov-jarvis` loyihasini ochadi;
- oddiy sozlamalarni qo‘yadi: `MODEL_ID=gemini-3.8-flash`, `APP_TIMEZONE=Asia/Tashkent`;
- kodni deploy qiladi va loglarni tekshiradi.

Siz qiladigan 4 ta ish — maxfiy qiymatlarni faqat siz kiritasiz.

### A1. Bot tokeni (BotFather)

1. Telegramda @BotFather → `/mybots` → botingiz → **API Token** → **Revoke current token**.
2. Yangi tokenni nusxalang. Uni chatga, Claude loyihasiga yoki hujjatga yozmang — faqat A4 da Vercel’ga.

### A2. Gemini kaliti (Google AI Studio)

1. [aistudio.google.com](https://aistudio.google.com) → Google akkauntingiz bilan kiring.
2. **Get API key** → **Create API key** → nusxalang.
3. Karta so‘ralsa — bosmang, bepul tarifga karta kerak emas.

### A3. Baza (Neon, Vercel ichidan)

1. [vercel.com](https://vercel.com) → `salohuddinov-jarvis` loyihasi → **Storage** → **Create Database** → **Neon**.
2. **Free** rejani tanlang → shartlarni o‘qib, roziman deb bosing → loyihaga ulang (Production belgilangan bo‘lsin).
3. `DATABASE_URL` o‘zi qo‘shiladi. Jadval va boshlang‘ich ma’lumotlarni Jarvis birinchi ishga tushganda o‘zi yaratadi.

### A4. Maxfiy sozlamalar (Vercel Variables)

Loyiha → **Settings → Environment Variables** → har biri uchun **Add** (Environment: **Production**, **Sensitive** belgilang):

| Nomi | Qiymati |
|---|---|
| `TELEGRAM_BOT_TOKEN` | A1 dagi yangi token |
| `GEMINI_API_KEY` | A2 dagi kalit |

Keyin Claude’ga “tayyor” deb yozing. Claude qayta deploy qiladi va webhook’ni tekshiradi (`/jarvis/webhook`).

### A5. Egani tasdiqlash

1. Telegramda botga `/start` yozing. Bot faqat sizning Telegram ID raqamingizni ko‘rsatadi va hali hech kimga ishlamaydi.
2. Raqamni Claude’ga yozing (bu sir emas). Claude `TELEGRAM_OWNER_USER_ID` ni qo‘yib, qayta deploy qiladi. Yoki o‘zingiz Variables’ga qo‘shib, **Redeploy** bosing.
3. Yana `/start` yozing. “Labbay, bro. Jarvis tayyor.” chiqishi kerak.

Shu paytdan boshlab bot faqat sizga ishlaydi.

### A6. Tekshirish

| Qadam | Kutiladigan natija |
|---|---|
| `/status` | Telegram ✅, Ega ✅, Baza ✅, Model 🟡 (birinchi javobdan keyin ✅), Jadval — birinchi uyg‘onishdan keyin ✅ |
| “Ertaga soat 15:00 da Aziza bilan uchrashuv, vazifa qil” | “Bajarildi: …”, `/today` da ko‘rinadi |
| “Ertaga soat 3 da …” | 03:00 yoki 15:00 ekanini so‘raydi |
| Boshqa akkauntdan yozish | Javob yo‘q |
| 21:00–21:59 | Kunlik hisobot o‘zi keladi |
| `/pause` | Keyingi hisobot kelmaydi; `/resume` bilan qaytadi |

### Vercel’da qanday ishlaydi (texnik)

- `eve build` Vercel’da `.vercel/output` yaratadi. Jadval — `agent/schedules/tick/h00…h23.ts`: 24 ta kunlik cron, har soatga bittadan (Hobby faqat kunlik cron’ga ruxsat beradi). Qaysi hisobot vaqti kelgani bazadan hisoblanadi, ikki marta yuborilmaydi.
- Webhook manzili `VERCEL_PROJECT_PRODUCTION_URL` dan olinadi, faqat `VERCEL_ENV=production` da. Preview deploy botni egallamaydi.
- Baza: `DATABASE_URL` yoki `POSTGRES_URL`. Migratsiyalar advisory lock bilan: bir vaqtda ochilgan ikki nusxa ularni ikki marta bajarmaydi.
- Vercel’da ichki fayl tizimi doimiy emas. Shuning uchun PGlite ishlatilmaydi: baza yo‘q bo‘lsa, Jarvis “Baza ulanmagan” deydi.

---

## B. Pullik muqobil: Railway (doimiy server)

| Xizmat | Narx |
|---|---|
| Railway Hobby | Oyiga $5, unga $5 lik resurs kiradi; karta kerak ([pricing](https://docs.railway.com/reference/pricing)) |

1. [railway.com](https://railway.com) → **Login with GitHub** → **Hobby**.
2. **New Project → Deploy from GitHub repo** → `salohuddinov-jarvis`. `Dockerfile` va `railway.json` ni Railway o‘zi topadi.
3. **Settings → Networking → Generate Domain**.
4. **Volume** qo‘shing, mount path: **`/data`**. Baza (PGlite) va sessiyalar shu yerda saqlanadi.
5. **Variables**: `TELEGRAM_BOT_TOKEN`, `MODEL_ID` va model kaliti (`GEMINI_API_KEY` yoki `ANTHROPIC_API_KEY`).
6. A5 dagidek egani tasdiqlang.

Railway’da `DATABASE_URL=pglite:/data/jarvis` va `APP_TIMEZONE` Dockerfile’da qo‘yilgan. Replica soni 1 bo‘lsin — PGlite bitta jarayon uchun.

## B2. O‘z VPS’ingiz (domen bilan)

Bitta Ubuntu 24.04 server, Node.js 24, Caddy (HTTPS) va systemd. Masalan Hetzner CX23, 5,99 €/oy. Domen va DNS A yozuvi kerak.

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs git caddy
sudo useradd -m -s /bin/bash jarvis && sudo -iu jarvis
git clone <repo> salohuddinov-jarvis && cd salohuddinov-jarvis
npm ci && cp .env.example .env && chmod 600 .env && nano .env
npm run check-env && npm run build
exit
sudo cp /home/jarvis/salohuddinov-jarvis/deploy/jarvis.service /etc/systemd/system/
sudo cp /home/jarvis/salohuddinov-jarvis/deploy/Caddyfile /etc/caddy/Caddyfile   # domenni o‘zgartiring
sudo systemctl daemon-reload && sudo systemctl enable --now jarvis && sudo systemctl reload caddy
```

`.env` ga `PUBLIC_URL=https://sizning-domen` yozing — webhook o‘zi o‘rnatiladi (yoki `npm run webhook:set`).

---

## C. Modelni almashtirish (kod o‘zgarmaydi)

Provayderni `MODEL_ID` belgilaydi (`agent/lib/model-config.ts`):

| Model | `MODEL_ID` | Kalit | Narx |
|---|---|---|---|
| Gemini (bepul tarif) | `gemini-3.8-flash` (limit kam bo‘lsa `gemini-3.5-flash-lite`) | `GEMINI_API_KEY` | Bepul tarif; pullik tarif ham bor |
| Claude Haiku 5.5 | `claude-haiku-5-5` | `ANTHROPIC_API_KEY` | $0,10 / 1M kirish, $0,50 / 1M chiqish token ([Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing)) |
| Claude Sonnet 5.5 | `claude-sonnet-5-5` | `ANTHROPIC_API_KEY` | $2 / 1M kirish, $10 / 1M chiqish token |

Claude API’ning bepul tarifi yo‘q. Vercel AI Gateway’ning bepul krediti faqat ayrim modellar uchun; 2026-10-14 holatida Claude va Gemini ular orasida yo‘q edi ([AI Gateway pricing](https://vercel.com/docs/ai-gateway/pricing)).

Almashtirish: Vercel → Variables → `MODEL_ID` va kalitni o‘zgartiring → **Redeploy**.

---

## Saqlash muddati

- Ovozli xabarlar diskka yozilmaydi; transkript suhbat tarixida qoladi.
- eve sessiyasi 7 kundan keyin yopiladi, yangi xabar yangi sessiya ochadi. Vazifa, loyiha va xotira bazada qoladi.
- Vercel Hobby’da tugagan workflow ma’lumotlari 1 kun saqlanadi. Bu suhbat jurnali; Jarvis’ning bazasi Neon’da alohida saqlanadi.
