import { expect, test, type Page } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const username = process.env.SOUNDPAD_TEST_USERNAME;
const password = process.env.SOUNDPAD_TEST_PASSWORD;
test.skip(!username || !password, 'Set SOUNDPAD_TEST_USERNAME and SOUNDPAD_TEST_PASSWORD for an isolated Supabase test project.');

async function addCategory(page: Page, label: string) {
  await page.getByLabel('ชื่อหมวดใหม่').fill(label);
  await page.getByRole('button', { name: 'เพิ่ม', exact: true }).click();
  await expect(page.getByText('บันทึกหมวดหมู่แล้ว')).toBeVisible();
}

test('admin uploads, previews, publishes, re-trims and deletes; visitors filter and play one pad', async ({ page, browser }, info) => {
  const dir = await mkdtemp(join(tmpdir(), 'soundpad-browser-'));
  const label = `ทดสอบ ${info.project.name} ${Date.now()}`;
  const clipA = `เสียงแรก ${label}`;
  const clipB = `เสียงสอง ${label}`;
  const files = [join(dir, 'first.wav'), join(dir, 'second.m4a')];
  const playback = await browser.newContext({ ...info.project.use });
  try {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'วนซ้ำ', exact: true })).toHaveAttribute('aria-pressed', 'false', { timeout: 2000 });
    await Promise.all([
      exec('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=f=440:d=8', '-c:a', 'pcm_s16le', files[0]]),
      exec('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=f=660:d=8', '-c:a', 'aac', files[1]]),
    ]);
    const publicPage = await playback.newPage();
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/login$/);
    await page.getByLabel('ชื่อผู้ใช้').fill(username!);
    await page.getByLabel('รหัสผ่าน').fill(password!);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'จัดการคลังเสียง' })).toBeVisible();
    await addCategory(page, label);
    await addCategory(page, `${label} ว่าง`);

    for (const [index, name] of [clipA, clipB].entries()) {
      await page.locator('input[type=file]').setInputFiles(files[index]);
      const editor = page.getByRole('region', { name: 'ตัดเสียง' });
      await expect(editor).toBeVisible({ timeout: 35_000 });
      await editor.getByLabel('ชื่อเสียง').fill(name);
      await editor.getByLabel('หมวดหมู่').selectOption({ label });
      await editor.getByLabel('เริ่ม (วินาที)').fill('1');
      await editor.getByLabel('จบ (วินาที)').fill('5');
      if (index === 0) {
        await editor.getByRole('slider', { name: 'จุดเริ่ม' }).press('ArrowRight');
        await expect(editor.getByLabel('เริ่ม (วินาที)')).toHaveValue('1.1');
        const previewUrl = await editor.locator('audio').getAttribute('src');
        const privateUrl = new URL(previewUrl!);
        privateUrl.pathname = privateUrl.pathname.replace('/object/sign/', '/object/public/');
        privateUrl.search = '';
        expect((await publicPage.request.get(privateUrl.href)).ok()).toBe(false);
        await editor.getByRole('button', { name: 'ฟังช่วงที่เลือก' }).tap();
        await expect(editor.getByRole('button', { name: 'หยุดพรีวิว' })).toBeVisible();
        await expect.poll(() => editor.locator('audio').evaluate((audio: HTMLAudioElement) => audio.currentTime), { timeout: 2500 }).toBeGreaterThan(1.1);
        await editor.getByRole('button', { name: 'หยุดพรีวิว' }).tap();
      }
      await editor.getByRole('button', { name: 'บันทึกเสียง' }).click();
      await expect(page.getByText('บันทึกเสียงแล้ว')).toBeVisible({ timeout: 25_000 });
    }

    await publicPage.goto('/');
    await expect(publicPage.getByRole('heading', { name: 'คลังเสียง' })).toBeVisible();
    await publicPage.getByRole('button', { name: `${label} ว่าง`, exact: true }).tap();
    await expect(publicPage.getByText('หมวดนี้ยังไม่มีเสียง')).toBeVisible();
    await publicPage.getByRole('button', { name: label, exact: true }).tap();
    const padA = publicPage.getByRole('button', { name: new RegExp(clipA) });
    const padB = publicPage.getByRole('button', { name: new RegExp(clipB) });
    const player = publicPage.locator('audio');
    const repeat = publicPage.getByRole('button', { name: 'วนซ้ำ', exact: true });
    await repeat.tap();
    await expect(repeat).toHaveAttribute('aria-pressed', 'true');
    await padA.tap();
    await expect(padA).toHaveAttribute('data-status', 'playing');
    const originalClip = await player.getAttribute('src');
    await expect.poll(() => player.evaluate((audio: HTMLAudioElement) => audio.currentTime)).toBeGreaterThan(0.4);
    await player.evaluate((audio: HTMLAudioElement) => { audio.currentTime = audio.duration - 0.15; });
    await expect.poll(() => player.evaluate((audio: HTMLAudioElement) => audio.currentTime)).toBeLessThan(0.7);
    await expect(padA).toHaveAttribute('data-status', 'playing');
    await expect.poll(() => player.evaluate((audio: HTMLAudioElement) => audio.paused)).toBe(false);
    await repeat.tap();
    await expect(repeat).toHaveAttribute('aria-pressed', 'false');
    await player.evaluate((audio: HTMLAudioElement) => { audio.currentTime = audio.duration - 0.15; });
    await expect(publicPage.getByRole('button', { name: 'หยุด', exact: true })).toBeDisabled();
    await repeat.tap();
    await padA.tap();
    await expect.poll(() => player.evaluate((audio: HTMLAudioElement) => audio.currentTime)).toBeLessThan(0.4);
    await padB.tap();
    await expect(padB).toHaveAttribute('data-status', 'playing');
    await expect(padA).not.toHaveAttribute('data-status', 'playing');
    expect(await publicPage.locator('audio').evaluateAll((players) =>
      players.filter((audio) => !(audio as HTMLAudioElement).paused).length)).toBe(1);
    await publicPage.getByRole('button', { name: 'หยุด', exact: true }).tap();
    await expect.poll(() => player.evaluate((audio: HTMLAudioElement) => audio.paused)).toBe(true);
    await expect(player).not.toHaveAttribute('src');

    await page.getByRole('listitem').filter({ hasText: clipA }).getByRole('button', { name: 'แก้ไข' }).click();
    await page.getByLabel('จบ (วินาที)').fill('7');
    await page.getByRole('button', { name: 'บันทึกเสียง' }).click();
    await expect(page.getByText('บันทึกเสียงแล้ว')).toBeVisible({ timeout: 25_000 });
    await publicPage.reload();
    await padA.tap();
    await expect(padA).toHaveAttribute('data-status', 'playing');
    expect(await player.getAttribute('src')).not.toBe(originalClip);

    for (const name of [clipA, clipB]) {
      await page.getByRole('button', { name: `ลบ ${name}`, exact: true }).click();
      await page.getByRole('button', { name: 'ยืนยันการลบ', exact: true }).click();
      await expect(page.getByText('ลบเสียงแล้ว')).toBeVisible();
    }
    await publicPage.reload();
    await expect(padA).toHaveCount(0);
    const forbidden = await publicPage.request.post('/api/admin/library', {
      headers: { Origin: new URL(publicPage.url()).origin },
      data: { action: 'categories.add', name: 'Unauthorized' },
    });
    expect(forbidden.status()).toBe(401);
    for (const name of [label, `${label} ว่าง`]) {
      await page.getByRole('button', { name: `ลบหมวด ${name}`, exact: true }).click();
      await page.getByRole('button', { name: 'ยืนยันลบหมวด' }).click();
      await expect(page.getByText('ลบหมวดหมู่แล้ว')).toBeVisible();
    }
  } finally {
    await playback.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('resumes a near-limit upload after a dropped chunk and trims from late in the source', async ({ page }, info) => {
  test.skip(info.project.name !== 'Android Chromium' || process.env.SOUNDPAD_TEST_LONG_AUDIO !== '1',
    'Enable SOUNDPAD_TEST_LONG_AUDIO=1 to generate and upload a 49 MB fixture.');
  const dir = await mkdtemp(join(tmpdir(), 'soundpad-long-'));
  const file = join(dir, 'long.mp3');
  const category = `ทดสอบไฟล์ยาว ${Date.now()}`;
  const name = `เสียงจากนาทีที่ 28 ${Date.now()}`;
  try {
    await exec('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=f=440:r=44100',
      '-t', '1780', '-c:a', 'libmp3lame', '-b:a', '224k', file]);
    await page.goto('/admin/login');
    await page.getByLabel('ชื่อผู้ใช้').fill(username!);
    await page.getByLabel('รหัสผ่าน').fill(password!);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await addCategory(page, category);

    let failedOffset = '';
    let resumed = false;
    await page.route('**/storage/v1/upload/resumable/sign/**', async (route) => {
      const request = route.request();
      const offset = request.headers()['upload-offset'];
      if (request.method() === 'PATCH' && Number(offset) > 0) {
        if (!failedOffset) {
          failedOffset = offset;
          return route.abort('internetdisconnected');
        }
        if (offset === failedOffset) resumed = true;
      }
      return route.continue();
    });
    await page.locator('input[type=file]').setInputFiles(file);
    const editor = page.getByRole('region', { name: 'ตัดเสียง' });
    await expect(editor).toBeVisible({ timeout: 110_000 });
    expect(resumed).toBe(true);
    await editor.getByLabel('ชื่อเสียง').fill(name);
    await editor.getByLabel('หมวดหมู่').selectOption({ label: category });
    await editor.getByLabel('เริ่ม (วินาที)').fill('1680');
    await editor.getByLabel('จบ (วินาที)').fill('1682');
    await editor.getByRole('button', { name: 'บันทึกเสียง' }).click();
    await expect(page.getByText('บันทึกเสียงแล้ว')).toBeVisible({ timeout: 55_000 });
    await page.getByRole('button', { name: `ลบ ${name}`, exact: true }).click();
    await page.getByRole('button', { name: 'ยืนยันการลบ', exact: true }).click();
    await expect(page.getByText('ลบเสียงแล้ว')).toBeVisible();
    await page.getByRole('button', { name: `ลบหมวด ${category}`, exact: true }).click();
    await page.getByRole('button', { name: 'ยืนยันลบหมวด' }).click();
    await expect(page.getByText('ลบหมวดหมู่แล้ว')).toBeVisible();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
