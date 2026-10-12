# DEPLOYMENT — Jarvis’ni ishga tushirish

Asosiy yo‘l: **GitHub + Railway**. Domen sotib olish, server boshqarish yoki terminal kerak emas — hammasi brauzerdan, telefondan ham bo‘ladi. Railway bepul `https://….up.railway.app` manzil beradi, Jarvis webhook’ni o‘zi ro‘yxatdan o‘tkazadi.

Muqobil yo‘l (o‘z VPS’ingiz va domeningiz bilan) — pastda, B bo‘limida.

---

## 0. Kerak bo‘ladigan akkauntlar

| Akkaunt | Nima uchun | To‘lov |
|---|---|---|
| GitHub | Kod shu yerda saqlanadi, Railway shundan oladi | Bepul |
| Railway | Server (doimiy ishlaydi) | Hobby: oyiga $5, unga $5 lik resurs kiradi ([Railway pricing](https://docs.railway.com/reference/pricing)). Karta kerak |
| Anthropic Console | Claude API kaliti | Ishlatganingizcha to‘laysiz, oldindan kredit olinadi. O‘zbekiston qo‘llab-quvvatlanadi ([ro‘yxat](https://platform.claude.com/docs/en/api/supported-regions)) |
| Telegram BotFather | Bot tokeni | Bepul |

Qaysi xorijiy kartalar ishlashi bankka bog‘liq — buni oldindan bilib bo‘lmaydi.

---

## 1. Bot tokeni

1. @BotFather → `/mybots` → bot → **API Token** → **Revoke current token**.
2. Yangi tokenni faqat 4-qadamda Railway’ga qo‘yasiz. Chatga, Claude loyihasiga yoki hujjatga yozmang.

## 2. GitHub

1. [github.com](https://github.com) da akkaunt oching (yoki mavjudiga kiring).
2. **New repository** → nomi `salohuddinov-jarvis` → **Private** → README qo‘shmasdan **Create**.
3. Repo nomini Claude’ga ayting (masalan `sizning-login/salohuddinov-jarvis`). Bu sir emas.
4. Claude GitHub ulanishini so‘raydi. Uni faqat shu repo uchun ruxsat bilan tasdiqlang. Keyin Claude kodni repoga yuklaydi.

## 3. Railway

1. [railway.com](https://railway.com) → **Login with GitHub**.
2. Billing’da **Hobby** rejasini yoqing.
3. **New Project** → **Deploy from GitHub repo** → `salohuddinov-jarvis`. Railway `Dockerfile` va `railway.json` ni o‘zi topadi.
4. Servisni oching → **Settings → Networking → Generate Domain**. `…up.railway.app` manzili paydo bo‘ladi.
5. Servisga **Volume** qo‘shing (servis ustida o‘ng tugma yoki **+ New → Volume**), mount path: **`/data`**. Baza va suhbat sessiyalari shu yerda saqlanadi — deploy’dan keyin ham yo‘qolmaydi.

## 4. Sozlamalar (Variables)

Servis → **Variables** → **New Variable**. Qiymatlarni faqat shu yerga yozing:

| Nomi | Qiymati |
|---|---|
| `TELEGRAM_BOT_TOKEN` | 1-qadamdagi yangi token |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) → API Keys → Create Key |
| `MODEL_ID` | `claude-sonnet-5-5` (joriy nomni [models](https://docs.claude.com/en/docs/about-claude/models) sahifasidan tekshiring) |

Kerak emas (avtomatik):
- `TELEGRAM_WEBHOOK_SECRET_TOKEN` — tokendan hosil qilinadi;
- `PUBLIC_URL` — Railway domeni olinadi;
- `DATABASE_URL` — `/data` volume’dagi baza;
- `APP_TIMEZONE` — Asia/Tashkent.

Saqlaganingizda Railway qayta deploy qiladi. **Deployments → View logs** da `telegram webhook registered` qatori chiqishi kerak.

## 5. Egani tasdiqlash

1. Telegramda botga `/start` yozing. Bot faqat sizning Telegram ID raqamingizni ko‘rsatadi — hali hech kimga ishlamaydi.
2. Railway → Variables → `TELEGRAM_OWNER_USER_ID` = shu raqam → saqlang (avtomatik qayta deploy).
3. Yana `/start` → “Labbay, bro. Jarvis tayyor.”

Shu paytdan boshlab bot faqat sizga ishlaydi.

## 6. Tekshirish

| Qadam | Kutiladigan natija |
|---|---|
| `/status` | Telegram ✅, Ega ✅, Baza ✅, Model 🟡 (birinchi javobdan keyin ✅) |
| “Ertaga soat 15:00 da Aziza bilan uchrashuv, vazifa qil” | “Bajarildi: …”, `/today` da ko‘rinadi |
| “Ertaga soat 3 da …” | 03:00 yoki 15:00 ekanini so‘raydi |
| Hisobot → Kunlik | NIMA QILDIK? / NIMA BO‘LDI? / ENDI NIMA QILAMIZ? |
| Boshqa akkauntdan yozish | Javob yo‘q |
| 21:00 | Kunlik hisobot o‘zi keladi |
| `/pause` | Keyingi hisobot kelmaydi; `/resume` bilan qaytadi |

## Railway’da muhim qoidalar

- **Replica soni 1** bo‘lsin (`railway.json` shunday). Baza (PGlite) bitta jarayon uchun.
- Volume o‘chirilsa — vazifalar, xotira va sessiyalar o‘chadi. Zaxira: Railway volume backup funksiyasi yoki keyinroq PostgreSQL servisiga o‘tish (`DATABASE_URL=postgres://…`).
- Yangilanish: Claude GitHub’ga yangi kod yuklasa, Railway o‘zi qayta deploy qiladi.

## Xarajat (taxmin)

| Xizmat | Narx | Izoh |
|---|---|---|
| Railway Hobby | $5/oy, $5 lik resurs ichida | Resurs: RAM $10/GB-oy, CPU $20/vCPU-oy, volume $0,15/GB-oy ([manba](https://docs.railway.com/reference/pricing)). Jarvis ~0,3–0,5 GB RAM ishlatadi deb **taxmin** qilsak, oyiga ~$5–8. Haqiqiy summa Railway → Usage’da ko‘rinadi |
| Claude Sonnet 5.5 | kirish $2 / 1M token, chiqish $10 / 1M token | [Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing). Kuniga ~40 xabarda keshsiz ~$1,5–2/kun (**taxmin**); prompt keshi bilan kamroq |
| Domen | kerak emas | Railway domeni bepul |

Xarajat chegarasi: `SESSION_MAX_INPUT_TOKENS`, `SESSION_MAX_OUTPUT_TOKENS` (Variables’da o‘zgartirsa bo‘ladi). Anthropic Console’da oylik limit ham qo‘yib qo‘ying.

---

## B. Muqobil: o‘z VPS’ingiz (domen bilan)

Bitta Ubuntu 24.04 server, Node.js 24, Caddy (HTTPS) va systemd. Arzon variant: Hetzner CX23, 5,99 €/oy ([taqqoslash ro‘yxati, 2026-08](https://kimmo.suominen.com/stuff/cpc-2026-08.txt)). Domen va DNS A yozuvi kerak.

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

## Saqlash muddati

- Ovozli xabarlar diskka yozilmaydi; transkript suhbat tarixida qoladi.
- eve sessiyasi 7 kundan keyin yopiladi, yangi xabar yangi sessiya ochadi. Vazifa, loyiha, xotira bazada qoladi.
