# دليل تشغيل تطبيق ACTES على سيرفرك (VPS) مع دومين Actes.tech

## ما ستحصل عليه

- التطبيق يعمل بالكامل على سيرفرك عبر Docker.
- دومين `actes.tech` و`www.actes.tech` مع شهادة HTTPS تلقائية (Caddy).
- قاعدة البيانات تبقى على Lovable Cloud (نفس البيانات الحالية، دون أي نقل).

## المتطلبات

1. سيرفر VPS بنظام Ubuntu (أو أي توزيعة مع Docker).
2. سجل DNS من نوع **A** للدومين `actes.tech` يشير إلى عنوان IP الخاص بسيرفرك،
   ومثله لـ `www.actes.tech`. (أضفه من لوحة تحكم مسجّل الدومين.)

## خطوات التشغيل

### 1) ثبّت Docker على السيرفر

```bash
curl -fsSL https://get.docker.com | sh
```

### 2) انسخ ملفات المشروع إلى السيرفر

من جهازك (داخل مجلد المشروع):

```bash
scp -r . root@IP-سيرفرك:/opt/actes
```

أو استخدم Git إن كان المشروع على مستودع.

### 3) أنشئ ملف البيئة على السيرفر

```bash
cd /opt/actes
cp .env.example .env
nano .env
```

املأ `ADMIN_PASSWORD` بكلمة مرور لوحة الإدارة. بقية القيم جاهزة.

### 4) شغّل التطبيق

```bash
docker compose up -d --build
```

خلال دقيقة تقريباً يصبح التطبيق متاحاً على `https://actes.tech`
(إصدار الشهادة أول مرة يتطلب أن تكون سجلات DNS قد انتشرت).

## أوامر مفيدة

```bash
docker compose logs -f app      # متابعة سجل التطبيق
docker compose up -d --build    # إعادة البناء بعد تحديث الكود
docker compose restart app      # إعادة تشغيل بعد تعديل .env
```

## ملاحظة مهمة: رابط الرد في n8n

في سيناريو n8n، حدّث خطوة «تحديث الطلب في التطبيق» إلى:

```
https://actes.tech/api/public/wa-invoice
```

حتى تصل أزرار تأكيد/إلغاء الفاتورة من واتساب إلى سيرفرك مباشرة.
