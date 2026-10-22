@AGENTS.md

# Salohuddinov Jarvis — quruvchi uchun qoidalar (builder Claude)

Bu fayl loyihani **quradigan/o‘zgartiradigan** Claude uchun. Ishlaydigan yordamchining ko‘rsatmalari — `agent/instructions.md` va `context/`.

## Arxitektura xaritasi

```
agent/
  agent.ts               model (MODEL_ID env → lib/model-config.ts: Gemini/Claude/Gateway), defaultTools:false, limitlar
  instructions.md        Jarvis shaxsiyati, vakolati, javob shakli (har chaqiruvda)
  instructions/10-context.ts  context/who-i-am, how-i-talk, how-you-work ni build vaqtida qo‘shadi
  skills/                kontent-yozish (context/content-rules.md), uchrashuv, montaj — talab bo‘yicha
  channels/telegram.ts   eve Telegram kanali → lib/inbound.ts
  channels/eve.ts        operator HTTP API auth
  tools/*.ts             model tool’lari (har biri ownerTool → server tomonda ega tekshiruvi)
  schedules/tick/hNN.ts  24 ta kunlik cron (Vercel Hobby) → lib/tick.ts → lib/scheduler.ts
  channels/setup.ts      GET /jarvis/webhook — deploy’dan keyin webhook’ni darhol o‘rnatish
  sandbox.ts             inert just-bash (shell tool’lar yo‘q)
  lib/webhook.ts         webhook’ni o‘zi o‘rnatadi (PUBLIC_URL / Railway / Vercel production), hosila secret
  lib/                   framework’siz biznes mantiq (unit sinovlanadi)
context/                 inson tahrirlaydigan yagona manba (shaxs, ovoz, ish tartibi, kontent qoidalari)
tests/unit               node:test + PGlite
tests/e2e                build qilingan eve server + mock Telegram/Gemini/Anthropic
```

## O‘zgarmas qoidalar (invariantlar)

1. **Sir yo‘q.** Token/kalit kodga, hujjatga, logga, model kontekstiga, xotiraga tushmaydi. `lib/redact.ts` stdout/stderr’ni filtrlaydi; `saveFact` sirni rad etadi. Chatda ochiq yuborilgan tokenni hech qayerga ko‘chirmang.
2. **Ruxsat server kodida.** Har tool `ownerTool()` orqali. Tashqi harakat faqat `approval_request` → owner tugma bosadi → `executeApproval`. Doimiy ruxsat faqat `/allow` buyrug‘i bilan (model bera olmaydi).
3. **Tasdiq versiyaga bog‘liq.** `approvalHash` = action + payload + recipient + vaqt + xarajat. Callback hash’i mos kelmasa — rad.
4. **Uydirma yo‘q.** Hisobotlar `lib/reports.ts` da bazadan deterministik. Yo‘q ma’lumot = “ma’lumot yo‘q”. Nol bazadan foiz yo‘q.
5. **Dalilsiz “tugallangan” yo‘q** (`updateTask`).
6. **Model ID qotirilmaydi** — faqat `MODEL_ID`; provayder `lib/model-config.ts` da.
7. **Idempotentlik.** Xabar: `msg:<chat>:<message_id>`; callback: `cb:<id>`; vazifa: `turnId + title` hash; hisobot: `owner:<tur>:<davr>`.
8. **Noaniq tashqi yuborish qayta yuborilmaydi** (`TelegramSendError.kind === "uncertain"` → `noaniq`).
9. **Integratsiya holati faqat dalildan** (`lib/integrations.ts`). Ulanmagan narsani “ulangan” deb ko‘rsatmang.
10. **context/ yagona manba.** Shaxs/uslub o‘zgarsa — `context/*.md` ni tahrirlang, nusxa yaratmang.

## Ish tartibi

```bash
export PATH=<node24>/bin:$PATH   # eve Node 24 talab qiladi
npm run typecheck
npm test                          # unit sinovlar
npm run build:test && npm run test:e2e        # E2E (~2 daqiqa), mock Gemini; E2E_PROVIDER=anthropic — mock Claude
npm run test:e2e:schedule        # scheduler (~3 daqiqa; o‘zi JARVIS_TICK_CRON bilan build qiladi — keyin build:test ni qayta yuring)
```

eve hujjatlari: `node_modules/eve/docs/` (avval `docs/README.md`). eve tez yangilanadi (0.77, 2026-10) — yangi versiyaga o‘tishdan oldin CHANGELOG va E2E sinovni ishga tushiring.

## Deploy

Asosiy (bepul): Vercel Hobby + Neon Free + Gemini free tier. Vercel’da fayl tizimi doimiy emas — baza faqat `DATABASE_URL`/`POSTGRES_URL` (Neon). Hobby: cron faqat kuniga 1 marta (shuning uchun 24 ta tick fayli; `*/5` deploy’ni buzadi), ±59 daqiqa. Webhook faqat `VERCEL_ENV=production` da o‘rnatiladi. Lokal `VERCEL=1 eve build` `VERCEL_OIDC_TOKEN` talab qiladi — Vercel’ning o‘z build’ida u bor.

Muqobil (pullik): Railway, `Dockerfile` + `railway.json`. `/data` volume: `DATABASE_URL=pglite:/data/jarvis`, `.eve/.workflow-data` → `/data/workflow` symlink. Replica 1. Build vaqtida `MODEL_ID` placeholder, runtime’da haqiqiy qiymat (E2E tasdiqlagan).

## Bosqichlar

1–2 tayyor (Telegram matn, ega, vazifalar, hisobot, jadval, tasdiq). Keyingisi:
- 3: Google Calendar adapteri (`lib/adapters/calendar.ts` shartnomasi), eslatmalar (30/10 daqiqa, `reminder_minutes`), mijoz follow-up.
- 4: Instagram (Meta rasmiy API, OAuth), kontent xotirasi, haftalik tavsiya.
- 5: STT sifat sinovi, TTS, video worker, telefon (Twilio Media Streams).

Yangi tashqi harakat qo‘shilsa: `ACTION_TYPES` + `executeApproval` ichida o‘z allowlist tekshiruvi + unit sinov.
