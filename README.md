# Soundpad

เว็บ Soundpad สำหรับมือถือ หน้าเล่นเปิดได้ผ่านลิงก์และเล่นเสียงทีละคลิป แอดมินจัดหมวดหมู่ อัปโหลด ฟังช่วงที่เลือก และกลับมาตัดใหม่ได้

## ตั้งค่าบนเครื่อง

1. ติดตั้ง Node.js 22.18 ขึ้นไป และรัน `npm ci` บน macOS ให้ติดตั้ง `ffmpeg` ด้วย Homebrew สำหรับ FFprobe และการสร้างไฟล์ทดสอบ
2. คัดลอก `.env.example` เป็น `.env.local` แล้วใส่ URL กับ publishable key ของ Supabase
3. สำหรับการพัฒนาในเครื่อง รัน `npx supabase@3.1.0 start` (ต้องเปิด Docker) และใช้ API URL กับ publishable key จาก `npx supabase@3.1.0 status`
4. ตั้ง `SOUNDPAD_ADMIN_USERNAME` เป็นชื่อที่ใช้ล็อกอิน และ `SOUNDPAD_ADMIN_EMAIL` เป็นอีเมลของบัญชี Supabase Auth
5. รัน `npm run dev` แล้วเปิด `/admin` เพื่อจัดการคลัง

## สร้างบัญชีแอดมิน

ใช้สคริปต์ครั้งเดียวต่อ environment จากเครื่องของผู้ดูแล ตั้ง `SUPABASE_URL`, `SUPABASE_SECRET_KEY` และ `SOUNDPAD_ADMIN_EMAIL` ใน shell สำหรับงานนี้ แล้วป้อนรหัสผ่านอย่างน้อย 12 ตัวอักษรแบบไม่แสดงบนหน้าจอ

```bash
# Bash
read -rsp 'Soundpad admin password: ' SOUNDPAD_ADMIN_PASSWORD
printf '\n'
export SOUNDPAD_ADMIN_PASSWORD
node scripts/provision-admin.mjs
unset SOUNDPAD_ADMIN_PASSWORD SUPABASE_SECRET_KEY
```

สคริปต์ยืนยันอีเมลและตั้ง `app_metadata.soundpad_admin=true` ให้บัญชีใหม่ เว็บใช้เฉพาะ publishable key กับ session ของแอดมิน จึงไม่ต้องตั้ง secret key หรือรหัสผ่านไว้ใน Vercel

## Supabase และ Vercel

- ใช้ migration ใน `supabase/migrations` ผ่าน `supabase db push --linked --dry-run` ก่อนนำขึ้นโปรเจกต์ที่ link ไว้ ปิด **Allow new users to sign up** และตั้งเพดาน Storage ของโปรเจกต์อย่างน้อย 50 MB
- ใส่ตัวแปรทั้งสี่จาก `.env.example` ใน environment ของ Vercel ที่ต้องการใช้ เลือก Node.js และเปิด Fluid compute สำหรับ Route Handler ตัดเสียง
- ตั้ง Vercel Firewall ให้จำกัด `POST /api/admin/login` ที่ 5 ครั้งต่อนาทีต่อ IP โค้ดแอปมีตัวนับแยกแต่ละ process สำหรับการรันบนเครื่อง
- ไฟล์ต้นฉบับอยู่ใน `soundpad-sources` แบบส่วนตัว คลิป MP3 ที่ตัดแล้วอยู่ใน `soundpad-clips` และเล่นจาก URL สาธารณะ เมื่อบันทึกช่วงใหม่จะเปลี่ยนไปใช้ URL คลิปใหม่ หากลบไม่ครบ ให้กด **ลองลบอีกครั้ง** จากหน้าแอดมิน
- ถ้าอัปโหลดหลุด ให้เลือกไฟล์เดิมจากรายการ **แบบร่าง** เพื่ออัปโหลดต่อ ถ้าส่งไฟล์ครบแล้วให้กด **วิเคราะห์ไฟล์**

## ทดสอบ

```bash
npm run lint
npm run typecheck
npm test
npm run build
npx supabase@3.1.0 test db
npx playwright install chromium webkit
```

เปิดเว็บให้ชี้ไปยัง Supabase สำหรับทดสอบและตั้ง `SOUNDPAD_TEST_USERNAME` กับ `SOUNDPAD_TEST_PASSWORD` ก่อนรัน `npm run test:browser` ใช้ `SOUNDPAD_TEST_URL` ถ้าไม่ได้เปิดเว็บที่พอร์ต 3000 และตั้ง `SOUNDPAD_TEST_LONG_AUDIO=1` เพื่อทดสอบอัปโหลดไฟล์ใกล้ 50 MB ต่อหลังเน็ตสะดุด เทสต์สร้างและลบหมวดกับคลิปของตัวเองในโปรเจกต์ที่กำหนด
