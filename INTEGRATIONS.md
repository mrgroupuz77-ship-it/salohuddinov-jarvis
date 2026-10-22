# INTEGRATIONS — har bir ulanish qanday ishlaydi va qanday yoqiladi

Har integratsiyaning holati: **ulangan / sozlangan, sinalmagan / ulanmagan / xato / eskirgan / o‘chirilgan**. Joriy holatni Telegramda `/status` ko‘rsatadi (`agent/lib/integrations.ts`).

## 1. Telegram (1–2-bosqich) — tayyor

- Kanal: eve’ning rasmiy Telegram kanali (`agent/channels/telegram.ts`), route `POST /eve/v1/telegram`.
- Har so‘rov `X-Telegram-Bot-Api-Secret-Token` bo‘yicha tekshiriladi. Secret `TELEGRAM_WEBHOOK_SECRET_TOKEN` dan yoki (bo‘sh bo‘lsa) bot tokenidan HMAC bilan hosil qilinadi — token revoke qilinsa secret ham avtomatik almashadi.
- Webhook’ni server o‘zi o‘rnatadi (`agent/lib/webhook.ts`): `PUBLIC_URL`, Railway’ning `RAILWAY_PUBLIC_DOMAIN` yoki Vercel production domeni (`VERCEL_PROJECT_PRODUCTION_URL`, faqat `VERCEL_ENV=production`). Deploy’dan keyin darhol tekshirish: `GET /jarvis/webhook` (secret qaytarmaydi). Jarayon boshida bir marta `setWebhook` (kutilayotgan xabarlar o‘chirilmaydi), keyin har 30 daqiqada `getWebhookInfo` bilan tekshiriladi; Telegram qaytargan oxirgi xato `/status` da ko‘rinadi.
- Faqat `TELEGRAM_OWNER_USER_ID` boshqaradi. Birinchi yozgan odam ega bo‘lmaydi. Guruhlar o‘chirilgan.
- Takroriy update: `chat_id + message_id` (callback uchun `callback_query.id`) bazada bir martalik kalit. eve Telegram kanali update’ni bizning hookka `update_id`siz beradi; xabar uchun bu kalit `update_id` bilan teng kuchli, chunki Telegram qayta yuborganda xabar o‘sha `message_id` bilan keladi.
- Buyruqlar va menyu (`Bugun / Loyihalar / Mijozlar / Kontent / Tahlil / Hisobot / Tasdiqlar / Sozlamalar`) modelsiz, bazadan javob beradi. Erkin o‘zbekcha matn modelga boradi.
- Tasdiq tugmalari (`Tasdiqlash / Tahrirlash / Bekor qilish`) — o‘zimizning callback’lar: `jv:a:<id>:<versiya-hash>:<qaror>`. Server faqat joriy versiya hash’i mos kelsa bajaradi.

Telegram qo‘ng‘irog‘i haqida: `phone.requestCall` faqat foydalanuvchi hisoblari uchun (MTProto). Bot API tokeni bilan bot Telegram ichida qo‘ng‘iroq qila olmaydi. Buni bot’ga qo‘shib bo‘lmaydi. Kerak bo‘lsa alohida foydalanuvchi hisobi integratsiyasi va uning xavfi (akkaunt bloklanishi, Telegram qoidalari) alohida ko‘rib chiqiladi.

## 2. Model — Gemini (bepul) yoki Claude, kalit kutilmoqda

- `agent/agent.ts` + `agent/lib/model-config.ts`. Provayder `MODEL_ID` dan aniqlanadi; model ID kodda qotirilmagan.
  - `gemini-…` → Google AI Studio, kalit `GEMINI_API_KEY` (yoki `GOOGLE_GENERATIVE_AI_API_KEY`). Bepul tarif bor; unda Google ma’lumotlarni mahsulotlarini yaxshilash uchun ishlatadi ([pricing](https://ai.google.dev/gemini-api/docs/pricing)).
  - `claude-…` → `ANTHROPIC_API_KEY` (pullik).
  - `vendor/model` → Vercel AI Gateway.
- Bepul limit tugasa (429 / RESOURCE_EXHAUSTED) Jarvis buni ochiq aytadi; buyruqlar modelsiz ishlayveradi.
- Gemini 3 tool chaqiruvlaridagi thought signature keyingi so‘rovga qaytariladi (E2E tekshirgan).
- `defaultTools: false` — model shell, fayl tizimi va subagent’larni ko‘rmaydi; faqat Jarvis tool’lari.
- Xarajat chegarasi: `SESSION_MAX_INPUT_TOKENS`, `SESSION_MAX_OUTPUT_TOKENS`.
- Kontent qoidalari `kontent-yozish` skill’ida: faqat kerak bo‘lganda yuklanadi.
- **O‘zbekcha kontent sifati Gemini bilan hali sinalmagan** (qabul sinovi #10).

Ixtiyoriy: veb-qidiruv (raqobatchilar tahlili uchun) — `eve add tool/web_search`. Anthropic’da narxi 1000 qidiruvga $10 + tokenlar ([manba](https://platform.claude.com/docs/en/about-claude/pricing)). Tashkilot sozlamasida web search yoqilgan bo‘lishi kerak. Hozir qo‘shilmagan.

## 3. Ma’lumotlar bazasi — tayyor

- PostgreSQL (`pg`) yoki PGlite (`pglite:./data/jarvis`).
- Sxema va migratsiyalar: `agent/lib/migrations.ts` (faqat qo‘shiladi, eski migratsiya o‘zgartirilmaydi).
- Jadvallar: `tasks`, `task_events`, `projects`, `clients`, `facts`, `settings`, `approvals`, `standing_grants`, `report_runs`, `processed_updates`, `notify_throttle`, `integration_events`.
- Asosiy manba qoidasi: barcha maydonlarning asosiy manbasi — shu baza. Notion ulanganda u faqat ko‘rinish bo‘ladi; ziddiyat bo‘lsa jim ustidan yozilmaydi, egaga ko‘rsatiladi.

## 4. Jadval va hisobotlar — tayyor

- `agent/schedules/tick/h00…h23.ts` — 24 ta kunlik cron, har soatga bittadan (Vercel Hobby faqat kunlik cron’ga ruxsat beradi; Vercel uni soat ichidagi istalgan daqiqada ishga tushiradi). Qaysi hisobot vaqti kelgani bazadagi sozlamadan hisoblanadi (Asia/Tashkent). Har uyg‘onish `/status` da ko‘rinadi.
- Boshlang‘ich: 09:00 ertalabki reja; 21:00 kunlik; yakshanba 19:00 haftalik; oyning 1-kuni 10:00 oldingi oy.
- Bir davr uchun bitta xabar: `report_runs` asosiy kaliti (`owner:daily:2026-10-12`). Bir vaqtda kelganlar bitta xabarga birlashadi.
- Yuborish holati noaniq bo‘lsa (tarmoq uzildi) — qayta yuborilmaydi, `noaniq` deb belgilanadi. Aniq xato bo‘lsa — 10 daqiqa oraliq bilan 3 martagacha.
- `/pause` — hammasi to‘xtaydi; `/resume kunlik` — faqat bittasi.

## 5. Ovozli xabarlar (STT) — kod bor, kalit kutilmoqda

- `agent/lib/adapters/stt.ts`: OpenAI-compatible `POST {STT_BASE_URL}/audio/transcriptions`.
- Yoqish: `STT_PROVIDER=openai-compatible`, `STT_MODEL`, `STT_API_KEY`, `STT_LANGUAGE=uz`.
- Jarvis eshitganini qaytarib ko‘rsatadi (“🎙 Eshitganim: …”). Ism, sana, raqamni saqlashdan oldin tasdiqlatadi.
- Audio diskka yozilmaydi. Chegara: `STT_MAX_SECONDS` (300 s), 20 MB.
- **O‘zbekcha sifati sinalmagan.** Tanlashdan oldin 10–20 ta haqiqiy ovozli xabar bilan sinab ko‘ring. Ishlamasa matnli suhbat davom etadi.

Bu — navbat bilan yuboriladigan ovozli xabarlar, jonli qo‘ng‘iroq emas.

## 6. Ovozli javob (TTS) — ulanmagan

`agent/lib/adapters/tts.ts` — shartnoma. Provayder o‘zbekcha talaffuz bo‘yicha amalda sinalgandan keyin tanlanadi. Boshqa odamning ovozi klonlanmaydi.

## 7. Google Calendar — ulanmagan (3-bosqich)

`agent/lib/adapters/calendar.ts` — shartnoma: `listEvents`, `createPersonalBlock`. Kerak bo‘ladi: Google Cloud loyiha, OAuth client, `calendar.events` scope, refresh token’ni bazada shifrlab saqlash. Boshqa odamlarga taklif yuborish faqat `approval_request` orqali. Hozircha uchrashuvlar vazifa sifatida saqlanadi va Jarvis “kalendarga yozilmadi” deydi.

## 8. Instagram — ulanmagan (4-bosqich)

`agent/lib/adapters/instagram.ts` — shartnoma va metrika qoidalari (yo‘q ko‘rsatkich = “ma’lumot yo‘q”, nol bazadan foiz yo‘q, turli davrlar aralashmaydi).

Kerak bo‘ladi: Professional (Business/Creator) akkaunt, Meta Developer ilovasi, Instagram Login yoki Facebook Login yo‘lidan **bittasi** (token va ruxsatlari aralashtirilmaydi), kerakli ruxsatlar (insights), App Review. Joriy talablar va API versiyasini ulash paytida rasmiy Meta hujjatidan tekshiring. Parol, cookie yoki 2FA kodi hech qachon so‘ralmaydi.

Hozir: skrinshot yoki CSV yuborilsa, Jarvis shu asosda tahlil qiladi va buni “jonli monitoring emas” deb belgilaydi.

“+” izohidan DM oqimi — alohida funksiya, faqat trigger, auditoriya, aniq matn va Meta cheklovlari tasdiqlangandan keyin yoqiladi.

## 9. Telefon qo‘ng‘irog‘i — o‘chirilgan (5-bosqich)

- `agent/lib/adapters/calls.ts`: `checkCall` qoidalari tayyor — `CALLS_ENABLED`, faqat `CALLS_ALLOWED_NUMBER`, tinch vaqtda faqat aniq belgilangan uyg‘otish. `placeCall` hozir doim xato beradi — tizim hech qachon “qo‘ng‘iroq qildim” demaydi.
- Reja: Twilio (yoki boshqa provayder) — chiquvchi qo‘ng‘iroq + ikki tomonlama Media Streams → STT → model → TTS. Gapni bo‘lish, jimlik, uzilish va qayta ulanish alohida ishlanadi. Javob bo‘lmasa — ketma-ket qo‘ng‘iroq emas, Telegramga qisqa xabar.
- eve’da `twilio` kanali bor (SMS va kiruvchi qo‘ng‘iroqni `<Gather>` orqali matnga o‘giradi) — bu oqimli suhbat emas, navbatma-navbat.
- Narx: O‘zbekistonga chiquvchi qo‘ng‘iroq mobil $0,1972/daqiqa ([Twilio](https://www.twilio.com/voice/pricing/uz)). O‘zbekiston raqamini olish mumkinligi va +998 ga yetkazish sifati **tekshirilmagan**.

## 10. Video montaj — ulanmagan (5-bosqich)

Render Telegram webhooki ichida qilinmaydi. Reja: alohida fon worker (ffmpeg), progress, qayta urinish, yopiq storage va vaqtli yuklab olish havolasi. Hozir Jarvis faqat montaj rejasi, vaqt belgilari va SRT subtitr tayyorlaydi (`agent/skills/montaj.md`).

## 11. Notion — ulanmagan

Kerak bo‘lsa sodda “Jarvis” bo‘limi: Bugun, Haftalik reja, Loyihalar, Mijozlar, 30 kunlik kontent, Hisobotlar. Avval mavjud sahifalar tekshiriladi, nusxa yaratilmaydi.
