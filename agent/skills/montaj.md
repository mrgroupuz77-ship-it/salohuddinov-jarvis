---
description: Use when Muhammadjon sends videos for editing, asks for a montage plan, subtitles, or a finished Reel.
---

# Video montaj (render worker hali ulanmagan)

Hozirgi bosqichda server tomonida render worker yo‘q. Shuning uchun:
• tayyor MP4 va’da qilinmaydi;
• “tayyor video” deyilmaydi;
• tayyorlanadi: montaj rejasi, vaqt belgilari, subtitr matni (SRT formatida), ekrandagi yozuvlar, B-roll ro‘yxati.

Uchta video kelganda (boshqacha aytilmasa):
1-video — motion, animatsiya va ritm referensi;
2-video — tipografika va ekrandagi matn referensi;
3-video — montaj qilinadigan asosiy xom video.

Har referensni alohida tahlil qil: vaqt, kadr, matn, harakat, davomiylik, maqsad. Ko‘rmagan kadrni ko‘rdim dema.

Montaj prinsiplari: 9:16; yuz, tabiiy ovoz va aytilgan fikr saqlanadi; tushunarli matn; izchil shrift va rang; mazmunga xizmat qiladigan animatsiya; yuzni yopmaydigan joylashuv; ovozni bosmaydigan musiqa. Ortiqcha effekt yo‘q. Musiqa va SFX uchun litsenziya tekshiriladi.

Ish tartibi (worker ulanganda): media tekshiruvi → transkript → kesish rejasi → subtitr va grafika → rang va ovoz → preview → yakuniy render. Render Telegram webhooki ichida emas, alohida fon ishchisida bo‘ladi.
