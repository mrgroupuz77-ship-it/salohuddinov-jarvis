# Salohuddinov Jarvis

Muhammadjon Salohuddinov uchun Telegram orqali ishlaydigan shaxsiy ish yordamchisi.
Asos: [eve](https://github.com/vercel/eve) agent runtime (TypeScript). Model — Gemini (bepul tarif) yoki Claude, `MODEL_ID` bilan almashtiriladi.

**Hozirgi bosqich: 1–2.** Telegramda matnli suhbat, faqat ega boshqaradi, vazifa/loyiha/mijoz bazasi, tasdiq tugmalari, kunlik/haftalik/oylik hisobot jadvali. Nima ishlashi va nima ulanish kutayotgani — [CONNECTION_STATUS.md](CONNECTION_STATUS.md).

## Telegramda nima qila oladi

Buyruq yodlash shart emas — oddiy yozing. Menyu ham bor:

| Tugma / buyruq | Nima qiladi |
|---|---|
| Bugun · `/today` | Bugungi 3 ta ustuvor ish, to‘siqlar, kutilayotgan tasdiqlar |
| Loyihalar · `/projects` | Loyiha kartalari (faol / pauza / aniqlanmagan) |
| Mijozlar · `/clients` | Mijozlar va bosqichlari |
| Kontent · `/content` | Ssenariy, hook, Stories, post, 30 kunlik reja — sizning uslubingizda |
| Tahlil | Instagram ulanmaguncha: skrinshot/CSV tahlili |
| Hisobot · `/report` | Bugun / Kunlik / Haftalik / Oylik |
| Tasdiqlar · `/approvals` | Tashqi harakatlar: Tasdiqlash / Tahrirlash / Bekor qilish |
| Sozlamalar · `/settings` | Vaqt zonasi, hisobot vaqtlari, tinch vaqt |
| `/status` | Qaysi integratsiya ulangan, qaysi biri yo‘q |
| `/pause`, `/resume [kunlik]` | Proaktiv xabarlarni to‘xtatish / yoqish |
| `/allow <harakat> <oluvchi>`, `/revoke …` | Doimiy ruxsat berish / olish (faqat siz) |

Misollar:
- “Ertaga soat 15:00 da Aziza bilan uchrashuv, tayyorgarlik vazifasini qo‘sh”
- “Faol loyihalar: kosimov_study va bozorbuva, qolganlari pauza”
- “Xususiy maktab uchun ota-onalarga Reels ssenariy yoz, 40 soniya”
- “Kunlik hisobotni 22:00 ga o‘tkaz”
- “Shu postni @kanalim ga joyla” → tasdiq tugmalari chiqadi, bosmaguningizcha hech narsa ketmaydi

## Ishga tushirish

To‘liq yo‘riqnoma: [DEPLOYMENT.md](DEPLOYMENT.md). Asosiy yo‘l — **to‘liq bepul**: Vercel Hobby + Neon Free + Gemini bepul tarifi. Karta va domen kerak emas.

1. BotFather’da tokenni yangilang.
2. [Google AI Studio](https://aistudio.google.com) → **Create API key**.
3. Vercel → loyiha → **Storage → Neon (Free)** → ulang.
4. Vercel → **Environment Variables**: `TELEGRAM_BOT_TOKEN`, `GEMINI_API_KEY` (Sensitive). `MODEL_ID=gemini-3.8-flash` oldindan qo‘yilgan.
5. Botga `/start` → ko‘rsatilgan ID’ni `TELEGRAM_OWNER_USER_ID` ga yozing → Redeploy.

Webhook, secret, jadval va vaqt zonasi o‘zi sozlanadi. Bepul tarifda hisobot belgilangan soat ichida keladi (masalan 21:00–21:59).

Lokal ishga tushirish (Node.js 24):

```bash
npm ci
cp .env.example .env && chmod 600 .env
npm run check-env && npm run build && npm start
```

## Sinovlar

```bash
npm test                                   # unit sinovlar (tarmoqsiz)
npm run build:test && npm run test:e2e     # build qilingan server + mock Telegram/Gemini
E2E_PROVIDER=anthropic npm run test:e2e    # xuddi shu, mock Claude bilan
npm run test:e2e:schedule                  # jadval o‘zi hisobot yuborishini tekshiradi (~3 daqiqa)
```

## Fayllar

| Fayl | Nima |
|---|---|
| `agent/instructions.md` | Jarvis’ning shaxsiyati, vakolati, ish sikli |
| `context/who-i-am.md` | Siz haqingizda — manba va holat bilan |
| `context/how-i-talk.md` | Ovoz profili (dastlabki) |
| `context/how-you-work.md` | Ish tartibi, ruxsatlar, hisobot tuzilmasi |
| `context/content-rules.md` | Kontent qoidalari (skill sifatida yuklanadi) |
| `context/video-reference.md` | AI yordamchi videosi tahlili |
| `context/sources.md` | Qaysi material o‘qildi, qaysi biri yo‘q |
| `agent/lib/migrations.ts` | Baza sxemasi |
| `agent/lib/reports.ts` | Hisobot shablonlari |
| `agent/schedules/tick/` | Jadval: 24 ta kunlik uyg‘onish (har soatga bittadan) → `agent/lib/tick.ts` |
| `agent/lib/model-config.ts` | Model provayderi (Gemini / Claude / AI Gateway) |
| `agent/lib/adapters/` | STT, TTS, kalendar, Instagram, qo‘ng‘iroq adapterlari |
| `INTEGRATIONS.md` | Har integratsiya va uni yoqish yo‘li |
| `CLAUDE.md` | Keyingi qurilish uchun qoidalar |

## Kontekstni yangilash

Shaxsiy ma’lumot, uslub yoki qoidalar o‘zgarsa — `context/` ichidagi faylni tahrirlang va `npm run build` + restart. Telegramdagi tuzatishlaringizni Jarvis o‘zi bazaga (`fact_save`) manba va sana bilan yozadi.
