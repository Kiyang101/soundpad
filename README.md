# Soundpad

เว็บ Soundpad สำหรับมือถือ หน้าเล่นเปิดได้ผ่านลิงก์และเล่นเสียงทีละคลิป แอดมินจัดหมวดหมู่ อัปโหลด ฟังช่วงที่เลือก และกลับมาตัดใหม่ได้

## ตั้งค่าบนเครื่อง

1. ติดตั้ง Node.js 22.18 ขึ้นไป และรัน `npm ci` บน macOS ให้ติดตั้ง `ffmpeg` ด้วย Homebrew สำหรับ FFprobe และการสร้างไฟล์ทดสอบ
2. คัดลอก `.env.example` เป็น `.env.local` แล้วใส่ URL กับ publishable key ของ Supabase
3. สำหรับการพัฒนาในเครื่อง รัน `npx supabase@3.1.0 start` (ต้องเปิด Docker) และใช้ API URL กับ publishable key จาก `npx supabase@3.1.0 status`
4. ตั้ง `SOUNDPAD_ADMIN_USERNAME` เป็นชื่อที่ใช้ล็อกอิน และ `SOUNDPAD_ADMIN_EMAIL` เป็นอีเมลของบัญชี Supabase Auth
5. รัน `npm run dev` แล้วเปิด `/admin` เพื่อจัดการคลัง

## นำเข้าเสียงจาก YouTube

หน้าแอดมินมีช่อง **ลิงก์ YouTube** รองรับลิงก์วิดีโอปกติ, `youtu.be`, Shorts และ embed กด **นำเข้าเสียง** เพื่อดึงเสียงเป็นต้นฉบับส่วนตัวและเปิด waveform เดิม จากนั้นฟัง เลือกช่วง ตั้งชื่อและหมวด แล้วกด **บันทึกเสียง** จึงจะแสดงบนหน้าเล่น

ต้นฉบับต้องเป็นวิดีโอสาธารณะที่เผยแพร่แล้ว ยาวไม่เกิน 30 นาที และไฟล์เสียงไม่เกิน 50 MB เลือกคลิปได้ตั้งแต่ 0.25 วินาทีถึง 2 นาที ไม่รองรับไลฟ์ วิดีโอส่วนตัว วิดีโอที่ต้องล็อกอิน หรือ playlist ทั้งชุด ลิงก์ที่มี playlist จะนำเข้าเฉพาะวิดีโอที่ระบุ

หลังบันทึก ตัวตัดเสียงจะยังเปิดอยู่ เลือกช่วงอื่นแล้วกด **บันทึกเป็นเสียงใหม่** เพื่อสร้างอีกแพดโดยเก็บแพดเดิมไว้ แต่ละแพดมีต้นฉบับของตัวเอง การลบแพดหนึ่งจึงไม่ลบต้นฉบับของแพดอื่น กด **ดาวน์โหลดคลิปที่บันทึก** หรือไอคอนดาวน์โหลดในคลังเพื่อเก็บ MP3 ลงเครื่อง

`npm ci` ติดตั้ง yt-dlp เวอร์ชันที่ตรึงไว้จาก official GitHub release และตรวจ SHA256 ให้อัตโนมัติใน `.tools/` รองรับ macOS และ Linux x64 หากต้องติดตั้งใหม่ให้รัน `npm run setup:youtube` ใช้ FFmpeg เดิมและ Node.js เป็น JavaScript runtime ของ yt-dlp ไม่ต้องเพิ่ม API key หรือบัญชี Google และไม่อ่าน cookies จาก browser

บน Vercel ให้ใช้ Linux x64 build ตามปกติ `next.config.ts` รวมตัวดาวน์โหลดกับ FFmpeg/FFprobe ใน route นำเข้าแล้ว โดย route นี้มีเพดาน 300 วินาที อย่านำ `.tools/` ที่สร้างบน macOS ไปใช้บน Linux โดยข้ามขั้นติดตั้ง ต้องทดสอบนำเข้าจาก deployment จริงก่อนเปิดใช้: YouTube อาจปฏิเสธ IP ของเซิร์ฟเวอร์หรือเปลี่ยนข้อกำหนดการดึงเสียง แม้ลิงก์จะเปิดดูใน browser ได้ หากขึ้นข้อความปฏิเสธ ให้ลองภายหลังหรืออัปโหลดไฟล์เสียงแทน ไม่ใช้การข้ามล็อกอินหรือ access controls

### ใช้ Mac เป็นตัวดึงให้ Vercel ชั่วคราว

เมื่อ Vercel ถูก YouTube ปฏิเสธ สามารถให้เว็บส่งงานมาที่ Mac ผ่าน worker ที่มีคีย์ส่วนตัวได้ ตัวช่วยรับเฉพาะลิงก์ YouTube ทำครั้งละหนึ่งงาน แล้วส่ง MP3 กลับไปให้เว็บวิเคราะห์และเก็บตามเดิม ไม่ต้องใส่รหัส Supabase หรือบัญชี Google ในตัวช่วย

1. สร้าง `.env.worker.local` (Git ไม่ติดตาม) ใส่ `YOUTUBE_WORKER_KEY` ที่สุ่มอย่างปลอดภัยอย่างน้อย 32 ตัวอักษร และ `PORT=8787` เช่นสร้างคีย์ด้วย `node -e "console.log(require('node:crypto').randomBytes(36).toString('base64url'))"` เก็บคีย์เป็นความลับ
2. รัน `npm run worker:youtube` ตัวช่วยฟังเฉพาะ `127.0.0.1:8787`
3. ติดตั้ง Cloudflare Tunnel ด้วย `brew install cloudflared` แล้วเปิดอีก terminal รัน `cloudflared tunnel --url http://127.0.0.1:8787 --no-autoupdate`
4. ตั้ง `YOUTUBE_WORKER_URL` ใน Vercel production เป็น URL HTTPS ที่ tunnel แสดง และ `YOUTUBE_WORKER_KEY` เป็นคีย์เดียวกับ Mac โดยตั้งคีย์เป็น sensitive แล้ว deploy ใหม่ ห้ามใส่คีย์ในตัวแปร `NEXT_PUBLIC_*`

ต้องเปิด Mac และทั้งสองโปรเซสไว้ เครื่องหลับหรือปิดตัวช่วยแล้วนำเข้าจาก YouTube จะไม่ได้ ส่วนคลิปที่บันทึกไว้ยังเล่นได้ตามปกติ หยุดด้วย Ctrl+C ในแต่ละ terminal เมื่อต้องการเปิดใหม่ให้ทำขั้นตอน 2–4 อีกครั้ง เพราะ Quick Tunnel เปลี่ยน URL ทุกครั้งและไม่มี uptime guarantee จึงเหมาะกับการใช้ชั่วคราว การย้ายไปโฮสต์ถาวรควรทดสอบดึงจริงก่อน

หากต้องการทดสอบเว็บในเครื่องผ่าน worker ให้ใส่ URL กับคีย์ใน `.env.local` ด้วย ถ้าไม่ตั้งทั้งสองค่าจะใช้ตัวดึงใน process เดิม หากตั้งเพียงค่าใดค่าหนึ่งจะแจ้งให้ตั้งค่าครบ การเชื่อมต่อบังคับ HTTPS ยกเว้น loopback ใน development/test และไม่ส่งคีย์ตาม redirect

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
- ใส่ตัวแปร Supabase และแอดมินทั้งสี่จาก `.env.example` ใน environment ของ Vercel ที่ต้องการใช้ เพิ่มตัวแปร worker เฉพาะเมื่อใช้ตัวช่วยแยก เลือก Node.js และเปิด Fluid compute สำหรับ Route Handler ตัดเสียง
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

ตั้ง `SOUNDPAD_TEST_YOUTUBE=1` เพื่อเพิ่มการทดสอบดึงคลิปเดนโอจริงบน Android Chromium แล้วบันทึก 4 ช่วงเป็นคนละแพด ตรวจการเล่นและดาวน์โหลด ก่อนลบข้อมูลทดสอบทั้งหมด การทดสอบนี้ใช้เครือข่ายจริงและอาจล้มเหลวเมื่อ YouTube ปฏิเสธการดึง ส่วน unit tests ใช้ executable fixture แทนการเรียก YouTube เพื่อทดสอบ validation, ขนาดไฟล์, การยกเลิก และการล้างไฟล์ชั่วคราว
