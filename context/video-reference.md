# AI yordamchi videosi — referens tahlili

Fayl: `886fa7cf-3717139505444375136.mp4`
Texnik: 129,3 soniya, 720×1280 (9:16), 30 fps, AAC stereo 44,1 kHz.
Tahlil usuli: har 4 soniyada kadr + 0:01, 0:05, 0:16, 2:08 dagi to‘liq o‘lchamli kadrlar; audio uchun `ffmpeg silencedetect` (−35 dB, ≥0,6 s).

> Uch toifa aralashtirilmaydi: **Videoda ko‘rindi** / **Videoda aytildi** / **Men taklif qilayotgan yechim**.

## 1. Videoda ko‘rindi

| Vaqt | Kuzatuv |
|---|---|
| 0:00–2:09 | Butun video davomida ustki yozuv: “AI AGENTIZ O‘ZI TELEFON QILIB UYG‘OTADIGAN ZAMONLARGA HAM KELDIK😄” |
| 0:00–0:06 | Qorong‘i xonada qo‘lda iPhone. Qulflangan ekranda kiruvchi qo‘ng‘iroq: “Аудиовызов Telegram”, qo‘ng‘iroq qiluvchi nomi **“Yordamchi”** (yonida emoji). Pastda “ответить” suruvchi tugmasi. Soat 03:44. |
| ~0:06–0:10 | Qo‘ng‘iroq qabul qilinadi (kadrlar orasida). |
| 0:16 | Faol qo‘ng‘iroq ekrani. Tepada bildirishnoma banneri: birinchi qatori “JARVIS – AI agent” deb o‘qiladi, ikkinchi qatori mayda, aniq o‘qilmadi. |
| 0:16–2:08 | Faol qo‘ng‘iroq ekrani: “Динамик” yoqilgan (karnay rejimi), “Видео”, “Выключить звук”, “Ещё”, “Завершить”, “Клавиатура”. Yuz ko‘rinmaydi. |
| 2:08 | Qo‘ng‘iroq hisoblagichi “02:00”, soat 03:45. Demak qo‘ng‘iroq taxminan 0:08 da boshlangan. |

## 2. Videoda aytildi

**Noma’lum.** Audio matnga o‘girilmadi (sabab: `context/sources.md`). Kim gapirgani, qaysi tilda va nima deyilgani bo‘yicha xulosa qilinmaydi.

Faqat signal o‘lchovi (mazmun emas):
- Audio butun video davomida bor, o‘rtacha balandlik −19 dB.
- 0,7 soniyadan uzun 19 ta pauza bor. Ular har 4–20 soniyada takrorlanadi. Eng uzun pauza 1:57–2:00 (3,2 s).
- Bu navbatma-navbat suhbatga o‘xshaydi, lekin buni faqat transkript tasdiqlaydi. Hozircha bu **taxmin**.

## 3. Video nimani isbotlamaydi

- Qo‘ng‘iroq qaysi API, server yoki xizmat orqali qilingani ko‘rinmaydi.
- Qo‘ng‘iroq qiluvchi AI ekanini yoki odam ekanini video o‘zi isbotlamaydi.
- Qo‘ng‘iroq oldindan belgilangan vaqtda avtomatik qilinganini ko‘rsatadigan dalil yo‘q.

Texnik izoh (rasmiy hujjat asosida, videodan emas): Telegram ichida qo‘ng‘iroq qilish (`phone.requestCall`) foydalanuvchi hisoblari uchun. Bot API tokeni bilan bot Telegram qo‘ng‘irog‘i qila olmaydi. “Yordamchi” nomli qo‘ng‘iroq qiluvchi oddiy Telegram foydalanuvchi hisobi bo‘lishi ehtimoli bor. Bu ham **taxmin**.

## 4. Men taklif qilayotgan yechim (Jarvis uchun)

Videodan olinadigan g‘oya: yordamchi o‘zi tashabbus qiladi va kerakli paytda bog‘lanadi.

Jarvisda bu quyidagicha ishlaydi:
1. **Hozir (1–2-bosqich):** tashabbus Telegram matni orqali — ertalabki reja, kechki hisobot, haftalik va oylik hisobot. Jadval sozlanadi, `/pause` bilan to‘xtaydi.
2. **5-bosqich:** haqiqiy telefon qo‘ng‘irog‘i alohida telephony provayderi orqali. U faqat tasdiqlangan raqamga, siz belgilagan vaqtda va xarajat chegarasida ishlaydi. Javob bo‘lmasa, ketma-ket qo‘ng‘iroq qilinmaydi, Telegramga qisqa xabar qoldiriladi.
3. **Telegram ichidagi qo‘ng‘iroq:** bot tokeni bilan qilinmaydi. Kerak bo‘lsa, alohida foydalanuvchi hisobi integratsiyasi kerak. Uning xavflari va Telegram qoidalari alohida tekshiriladi.
4. Ovoz: boshqa odamning ovozi klonlanmaydi. O‘zbekcha TTS ovozi amalda sinab tanlanadi.

Muloqot uslubi audio tahlilidan **emas**, prompt va kontent qoidalaridan olindi (`context/how-i-talk.md`). Videoning transkripti qo‘shilsa, bu bo‘lim yangilanadi.
