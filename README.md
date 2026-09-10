<div align="center">

<img src="./assets/logo.png" alt="FastSTFP Logo" width="180" height="180" />

# FastSTFP

### High-Performance SFTP Transfer System with TrueColor ANSI Logging & Binary Hash Protection

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20.x+-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20Linux-0078D6?style=for-the-badge&logo=windows&logoColor=white)](#)
[![License](https://img.shields.io/badge/License-MIT-00f2fe?style=for-the-badge)](#)

</div>

---

## ⚡ درباره پروژه (About FastSTFP)

**FastSTFP** یک ابزار مدرن، فوق‌سریع و هوشمند برای همگام‌سازی و انتقال فایل‌های محلی به سرورهای لینوکس (VPS) از طریق پروتکل امن SFTP است. این ابزار به گونه‌ای مهندسی شده که فقط **محتویات داخل پوشه محلی** را به مقصد منتقل کند و با استفاده از سیستم‌های مانیتورینگ زنده، رابط کاربری پایانه را متحول کند.

```text
  ███████╗ █████╗ ███████╗████████╗███████╗████████╗███████╗██████╗ 
  ██╔════╝██╔══██╗██╔════╝╚══██╔══╝██╔════╝╚══██╔══╝██╔════╝██╔══██╗
  █████╗  ███████║███████╗   ██║   ███████╗   ██║   █████╗  ██████╔╝
  ██╔══╝  ██╔══██║╚════██║   ██║   ╚════██║   ██║   ██╔══╝  ██╔═══╝ 
  ██║     ██║  ██║███████║   ██║   ███████║   ██║   ██║     ██║     
  ╚═╝     ╚═╝  ╚═╝╚══════╝   ╚═╝   ╚══════╝   ╚═╝   ╚═╝     ╚═╝     
  ───────────────────────────────────────────────────────────────────
  FastSTFP │ High-Performance SFTP Sync Engine │ v1.0.0
  Zero-Emoji ANSI 24-bit TrueColor Terminal System
  ───────────────────────────────────────────────────────────────────
```

---

## ✨ ویژگی‌های برجسته (Key Features)

- 🎨 **سیستم لاگ مدرن با پالت رنگی ۲۴ بیتی (24-bit TrueColor ANSI)**:
  - رعایت قانون سخت‌گیرانه **Zero Emojis** برای حفظ یکدستی و زیبایی خروجی در تمام ترمینال‌ها (`[✓]`, `[✗]`, `[!]`, `[i]`).
  - اسپینر چرخشی نرم Braille (`⠋ ⠙ ⠹ ...`) با قابلیت تطبیق در محیط‌های تعاملی TTY و CI/CD.
  - نمایش میلی‌ثانیه‌ای زمان پینگ و تاخیر هر عملیات `(142ms)`.
- 📊 **نوار پیشرفت زنده (Live Progress Bar)**:
  - نمایش درصد پیشرفت با نوار گرافیکی اختصاصی.
  - نمایش لحظه‌ای حجم منتقل‌شده، تعداد فایل‌ها و سرعت انتقال (`MB/s`).
- 🛡️ **محافظت خودکار با اثر انگشت هش باینری (SHA-256 Self-Protection)**:
  - برنامه هش فایل اجرایی خود را محاسبه می‌کند؛ حتی اگر نام فایل `.exe` به چیز دیگری تغییر کند یا درون پوشه همگام‌سازی قرار گیرد، شناسایی شده و هرگز به سرور VPS فرستاده نمی‌شود.
- ⚙️ **فیلترهای باز و بسته کردن فایل‌ها (`ignore`)**:
  - امکان فعال/غیرفعال‌سازی ارسال فایل‌ها و پوشه‌هایی مثل `node_modules`, `dist`, `.git`, `package-lock.json`, `README.md` به صورت `true`/`false`.
- 🚀 **سیستم آپلود همزمان (Parallel Concurrency)**:
  - ارسال همزمان چندین فایل برای به حداکثر رساندن سرعت انتقال در ارتباط با سرور.
- 📦 **نسخه اجرایی مستقل (`.exe`)**:
  - امکان تولید یک فایل `.exe` بدون نیاز به نصب هیچ‌گونه پیش‌نیاز یا Node.js، همراه با آیکون و متادیتای اختصاصی.

---

## 🚀 شروع سریع (Quick Start)

### ۱. کلون کردن ریپازیتوری
```bash
git clone https://github.com/thebx123/FastSTFP.git
cd FastSTFP
```

### ۲. نصب وابستگی‌ها
```bash
npm install
```

### ۳. آماده‌سازی تنظیمات (`manage.json`)
فایل نمونه را کپی کرده و اطلاعات سرور خود را در آن وارد کنید:
```bash
cp manage.example.json manage.json
```

```json
{
  "host": "YOUR_SERVER_IP",
  "port": 22,
  "username": "root",
  "password": "YOUR_PASSWORD",
  "privateKeyPath": "",
  "localDir": "./upload",
  "serverDir": "/var/www/my-site",
  "concurrency": 4,
  "ignore": {
    "node_modules": true,
    ".git": true,
    "dist": false,
    "package-lock.json": true,
    "README.md": false
  }
}
```

### ۴. اجرا
```bash
npm start
```
یا در حالت توسعه و مشاهده زنده تغییرات (Watch mode):
```bash
npm run dev
```

---

## 🛠️ ساخت نسخه مستقل ویندوز (`.exe`)

برای ساخت فایل اجرایی تکی ویندوز همراه با آیکون Cyber Neon:

```bash
npm run build:exe
```

پس از پایان بیلد، پوشه **`release/`** ایجاد می‌شود که شامل فایل‌های زیر است:
```text
release/
├── FastSTFP.exe    # فایل اجرایی کامل و مستقل ویندوز (بدون نیاز به نصب Node.js)
└── manage.json     # فایل کانفیگ اختصاصی کنار فایل exe
```
تنها کافیست این پوشه را در هر سیستم ویندوزی منتقل کرده و از آن استفاده نمایید.

---

## 📂 ساختار کدهای پروژه (Project Structure)

```text
FastSTFP/
├── assets/
│   ├── icon.ico              # آیکون چندرزولوشن ویندوز
│   └── logo.png              # لوگوی باکیفیت پروژه
├── scripts/
│   ├── build-exe.ts          # اسکریپت ساخت نسخه تک فایل .exe
│   └── make-ico.ps1          # تبدیل کننده لوگو به فرمت آیکون ویندوز
├── src/
│   ├── Config.ts             # ماژول خواندن و اعتبارسنجی کانفیگ
│   ├── Logger.ts             # هسته لاگر TrueColor با اسپینر و پینگ
│   ├── Protection.ts         # سیستم تشخیص هش باینری برای محافظت از ارسال خود فایل
│   └── Transfer.ts           # اسکنر و موتور همگام‌سازی SFTP با نوار پیشرفت
├── Index.ts                  # نقطه ورود اصلی برنامه
├── manage.example.json       # فایل نمونه تنظیمات
├── package.json
└── tsconfig.json
```

---

## 🔒 امنیت و حریم خصوصی

> [!IMPORTANT]
> فایل `manage.json` که حاوی پسورد سرور و مشخصات اتصال شماست در فایل `.gitignore` قرار گرفته و هیچ‌گاه در ریپازیتوری گیت کامیت نخواهد شد.

---

## 📝 لایسنس

این پروژه تحت لایسنس **MIT** منتشر شده است.
