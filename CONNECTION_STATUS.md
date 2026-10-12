# CONNECTION_STATUS — nima amalda ishlaydi

Holat sanasi: 2026-10-12. Bu fayl faqat tekshirilgan holatni yozadi.

## Qanday tekshirildi

Qurilish muhitida haqiqiy Telegram (`api.telegram.org`) tarmoq siyosati bilan yopiq edi. Claude API kaliti ham yo‘q edi (kalit so‘ralmadi). Shuning uchun:

- **Unit sinovlar** — 47/47 o‘tdi (`npm test`). Haqiqiy PostgreSQL dvigateli (PGlite) bilan.
- **End-to-end sinov** — 26/26 o‘tdi (`npm run test:e2e`). Railway konteyneri bilan bir xil qadamlarda (toza nusxa, `npm ci`, placeholder `MODEL_ID` bilan build, `npm prune`, `/data` volume symlink) qayta ishga tushirildi — 27/27. **Haqiqiy build qilingan eve server** ishga tushirildi; Telegram Bot API va Anthropic API o‘rniga lokal mock serverlar ishladi. Webhook → ega tekshiruvi → model → tool → baza → Telegram javobi zanjiri to‘liq yurdi.
- **Jadval sinovi** — `npm run test:e2e:schedule`: server o‘zi (eve/Nitro scheduler) kunlik hisobotni egaga yubordi va keyingi tick’da qayta yubormadi. Natija pastda.

**Haqiqiy bot va haqiqiy Claude bilan hali ishga tushirilmagan.** Buning uchun server, yangi token va API kalit kerak (DEPLOYMENT.md).

## Holat jadvali

| Funksiya | Holat | Dalil |
|---|---|---|
| Telegram webhook (secret header tekshiruvi) | ✅ kod tayyor, mock bilan tekshirildi | E2E: secret’siz va noto‘g‘ri secret → 401 |
| Webhook’ni server o‘zi o‘rnatadi (Railway domeni, tokendan hosila secret) | ✅ mock bilan tekshirildi | E2E: `setWebhook` to‘g‘ri URL va secret bilan chaqirildi |
| Railway uchun Docker image | 🟡 qadamlar simulyatsiya qilindi | Bu muhitda Docker daemon yo‘q; Dockerfile buyruqlari toza nusxada bajarilib, E2E 27/27 o‘tdi. Haqiqiy Railway build hali bo‘lmagan |
| Model ID ishlash vaqtidagi sozlamadan | ✅ tekshirildi | E2E: build `build-placeholder`, so‘rov `claude-runtime-model` bilan ketdi |
| Faqat ega boshqaradi, begona bloklanadi | ✅ tekshirildi | Unit #1, E2E: begonaga javob yo‘q, model chaqirilmadi |
| Guruhlar o‘chirilgan | ✅ tekshirildi | Unit #1 |
| Takroriy update ikki marta ishlanmaydi | ✅ tekshirildi | Unit #2, E2E |
| Webhook tez javob, uzoq ish fonda | ✅ tekshirildi | E2E: 200 javob < 2 s |
| Matnli suhbat (Claude + tool’lar) | 🟡 mock model bilan tekshirildi | E2E: model → `task_create` → javob. Haqiqiy model sifati sinalmagan |
| Vazifalar, loyihalar, mijozlar bazasi | ✅ tekshirildi | Unit + E2E (`/today` vazifani ko‘rsatdi) |
| “Tugallangan” faqat dalil bilan | ✅ tekshirildi | Unit #6 |
| Restartdan keyin ma’lumot saqlanadi | ✅ tekshirildi | Unit #3, E2E restart |
| Vaqt zonasi (Asia/Tashkent), noaniq vaqt ogohlantirishi | ✅ tekshirildi | Unit #4, E2E (15:00 to‘g‘ri saqlandi) |
| Kunlik/haftalik/oylik hisobot (bazadan, raqam to‘qilmaydi) | ✅ tekshirildi | Unit #6, E2E “Hisobot → Kunlik” |
| Jadval bo‘yicha proaktiv hisobot | ✅ tekshirildi (scheduler sinovi) | `run-e2e-schedule.ts` natijasi pastda |
| Pauza / bitta hisobotni qayta yoqish | ✅ tekshirildi | Unit #13 |
| Tasdiq: Tasdiqlash / Tahrirlash / Bekor qilish | ✅ tekshirildi | Unit #7–8, E2E: tasdiqdan oldin post yo‘q, keyin aynan shu matn ketdi, ikkinchi bosish qayta yubormadi |
| Doimiy ruxsat (`/allow`) | ✅ tekshirildi | Unit #7 |
| Token/secret log va model kontekstiga chiqmaydi | ✅ tekshirildi | Unit #14, E2E (model so‘rovlari va server logi tekshirildi) |
| Xotira: fakt/afzallik/uslub qoidasi, sirlarni rad etish | ✅ tekshirildi | Unit #14 |
| Kontent yozish qoidalari (skill) | 🟡 ulangan, sifat sinalmagan | E2E: skill ro‘yxatda, har xabarga to‘liq yuborilmaydi. Haqiqiy matn sifati faqat haqiqiy model bilan baholanadi (#10) |
| Ovozli xabar → matn (STT) | 🟡 kod bor, kalit kutilmoqda | Unit #5 (soxta STT bilan). O‘zbekcha sifati sinalmagan |
| Ovozli javob (TTS) | ⚪ ulanmagan | Provayder tanlanmagan |
| Google Calendar | ⚪ ulanmagan (3-bosqich) | Adapter shartnomasi bor, OAuth yo‘q |
| Notion | ⚪ ulanmagan | Asosiy manba — ichki baza |
| Instagram (Meta API) | ⚪ ulanmagan (4-bosqich) | Unit #9: soxta statistika chiqmaydi |
| Video montaj worker | ⚪ ulanmagan (5-bosqich) | Faqat montaj rejasi/subtitr (#11) |
| Telefon qo‘ng‘irog‘i | ⏸ o‘chirilgan (`CALLS_ENABLED=false`) | Unit #12: qo‘ng‘iroq qilinmaydi, “qildim” deyilmaydi |
| Telegram ichidagi qo‘ng‘iroq | ⛔ bot tokeni bilan mumkin emas | `phone.requestCall` faqat foydalanuvchi hisoblari uchun |
| 24/7 ishlash | ⚪ server hali yo‘q | DEPLOYMENT.md (GitHub + Railway) |
| GitHub repo | ⚪ hali yo‘q | Repo ochilgach Claude kodni yuklaydi |

## Qabul sinovlari (prompt 18-bo‘lim)

| # | Sinov | Natija |
|---|---|---|
| 1 | Begona foydalanuvchi | ✅ o‘tdi |
| 2 | Takroriy webhook | ✅ o‘tdi |
| 3 | Restartdan keyin saqlanish | ✅ o‘tdi |
| 4 | Vaqt zonasi, noaniq vaqt | ✅ o‘tdi (kalendar emas, vazifa bazasida — kalendar ulanmagan) |
| 5 | Ovozli topshiriq | 🟡 qisman: oqim soxta STT bilan o‘tdi; haqiqiy STT kaliti yo‘q |
| 6 | Hisobot raqamlari | ✅ o‘tdi |
| 7 | Tasdiqsiz tashqi harakat yo‘q | ✅ o‘tdi |
| 8 | O‘zgargan matn — eski tasdiq yaroqsiz | ✅ o‘tdi |
| 9 | Instagram uzilganda soxta statistika yo‘q | ✅ o‘tdi |
| 10 | Kontent uslubga mos, uydirmasiz | ⚪ o‘tkazilmadi — haqiqiy model kerak |
| 11 | Montaj “tayyor” faqat tekshirilgan fayl bilan | ⚪ o‘tkazilmadi — worker yo‘q; tizim “tayyor video” demaydi |
| 12 | Telefon o‘chiq bo‘lsa qo‘ng‘iroq yo‘q | ✅ o‘tdi |
| 13 | Pauza | ✅ o‘tdi |
| 14 | Tokenlar oqmaydi | ✅ o‘tdi |

## Jadval sinovi natijasi

Sinov: 2026-10-12, 19:45–19:56 (Toshkent). Build qilingan server `eve start` bilan ishga tushirildi, kunlik hisobot vaqti “1 daqiqa oldin” qilib qo‘yildi.

```
PASS scheduler o‘zi kunlik hisobotni egaga yubordi (vaqt 19:45 Toshkent)
PASS keyingi tick’da shu davr qayta yuborilmadi
```

Yuborilgan hisobot (bo‘sh sinov bazasi — raqam to‘qilmagan):

```
KUNLIK HISOBOT — 12-oktabr

NIMA QILDIK?
• Bugun tugallangan vazifa qayd etilmagan.

NIMA BO‘LDI?
• Yangi vazifa: 0 · holati o‘zgargan: 0
• Kechikkan: 0
• Instagram ko‘rsatkichlari: ma’lumot yo‘q (API ulanmagan).

ENDI NIMA QILAMIZ?
• Ochiq vazifa yo‘q. Ertangi 3 ta ishni yozing.

Manba: Jarvis bazasi · davr: 12.10.2026 00:00 – 13.10.2026 00:00 (Asia/Tashkent)
```
