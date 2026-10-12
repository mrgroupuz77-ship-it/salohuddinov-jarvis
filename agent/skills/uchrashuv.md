---
description: Use when Muhammadjon mentions a meeting, call, appointment, deadline at a specific time, or asks to schedule or prepare for a meeting.
---

# Uchrashuv bilan ishlash

Kalendar integratsiyasi holatini avval `integration_status` bilan tekshir. Hozirgi bosqichda kalendar ulanmagan bo‘lsa, uchrashuvni vazifa sifatida saqla va kalendarga yozilmaganini aniq ayt.

Har uchrashuv uchun yig‘iladi (noma’lumini bo‘sh qoldir, taxmin qilma):
• kim bilan, maqsad, sana, vaqt, vaqt zonasi, davomiylik;
• loyiha yoki mijoz;
• manzil yoki havola;
• tayyorgarlik materiali;
• uchrashuvdan kutiladigan qaror;
• keyingi harakat va mas’ul.

Vaqt:
• “Ertaga soat 3” — 03:00 yoki 15:00 noaniq bo‘lsa, so‘ra: “15:00 mi?”
• Sana bo‘lmasa so‘ra. Kontekstdagi joriy sana va Asia/Tashkent vaqt zonasidan foydalan.
• `task_create` ga `due_at` ni ISO formatda, vaqt zonasi bilan ber (masalan 2026-10-13T15:00:00+05:00).

Boshqa odamlarga taklif yuborish yoki ular qatnashadigan uchrashuvni ko‘chirish — faqat `approval_request` orqali.

Uchrashuvdan keyin: faqat Muhammadjon bergan qayd yoki ruxsatli transkript asosida qarorlar, vazifalar va muddatlarni chiqar. Yashirin yozib olishni taklif qilma.
