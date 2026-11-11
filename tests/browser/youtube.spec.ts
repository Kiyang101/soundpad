import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
let adminCookies: Awaited<ReturnType<BrowserContext['cookies']>> | undefined;

async function openAdmin(page: Page) {
  if (adminCookies) {
    await page.context().addCookies(adminCookies);
    await page.goto('/admin');
  } else {
    await page.goto('/admin/login');
    await page.getByLabel('ชื่อผู้ใช้').fill(process.env.SOUNDPAD_TEST_USERNAME!);
    await page.getByLabel('รหัสผ่าน').fill(process.env.SOUNDPAD_TEST_PASSWORD!);
    const loginResponse = page.waitForResponse((response) => response.url().endsWith('/api/admin/login'));
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    const login = await loginResponse;
    if (!login.ok()) {
      await page.getByLabel('รหัสผ่าน').fill('');
      throw new Error(`Test admin login failed: HTTP ${login.status()}`);
    }
  }
  await expect(page.getByRole('heading', { name: 'จัดการคลังเสียง' })).toBeVisible();
  adminCookies = await page.context().cookies();
}

test('YouTube import and saved downloads require an admin session', async ({ request, baseURL }) => {
  const imported = await request.post('/api/admin/youtube', {
    headers: { Origin: new URL(baseURL!).origin }, data: { url: 'https://youtu.be/3F4_A1gulWs' },
  });
  expect(imported.status()).toBe(401);
  expect((await request.get(`/api/admin/download?id=${randomUUID()}`)).status()).toBe(401);
});

test('admin validates YouTube URLs, saves another range independently and downloads MP3', async ({ page, context, baseURL }, info) => {
  test.skip(!process.env.SOUNDPAD_TEST_USERNAME || !process.env.SOUNDPAD_TEST_PASSWORD, 'Requires isolated test admin.');
  const dir = await mkdtemp(join(tmpdir(), 'soundpad-copy-'));
  const label = `สำเนา ${Date.now()}`;
  const original = `ต้นฉบับ ${label}`;
  const copied = `ช่วงที่สอง ${label}`;
  let categoryId = '';
  try {
    const file = join(dir, 'source.wav');
    await exec('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=f=440:d=8', file]);
    await openAdmin(page);
    await expect(page.getByLabel('ลิงก์ YouTube')).toBeVisible();
    const invalid = await context.request.post('/api/admin/youtube', {
      headers: { Origin: new URL(baseURL!).origin }, data: { url: 'https://youtube.com.evil.test/watch?v=3F4_A1gulWs' },
    });
    expect(invalid.status()).toBe(400);
    await page.getByLabel('ชื่อหมวดใหม่').fill(label);
    const addedCategory = page.waitForResponse((response) => response.url().endsWith('/api/admin/library') && response.request().postDataJSON()?.action === 'categories.add');
    await page.getByRole('button', { name: 'เพิ่ม', exact: true }).click();
    categoryId = (await (await addedCategory).json()).id;
    await expect(page.getByText('บันทึกหมวดหมู่แล้ว')).toBeVisible();
    await page.locator('input[type=file]').setInputFiles(file);
    const editor = page.getByRole('region', { name: 'ตัดเสียง' });
    await expect(editor).toBeVisible();
    await editor.getByLabel('ชื่อเสียง').fill(original);
    await editor.getByLabel('หมวดหมู่').selectOption({ label });
    await editor.getByLabel('เริ่ม (วินาที)').fill('0');
    await editor.getByLabel('จบ (วินาที)').fill('2');
    await editor.getByRole('button', { name: 'บันทึกเสียง', exact: true }).click();
    await expect(page.getByText('บันทึกเสียงแล้ว', { exact: true })).toBeVisible();
    const before = await context.request.post('/api/admin/library', {
      headers: { Origin: new URL(baseURL!).origin }, data: { action: 'sounds.list' },
    });
    let first = (await before.json()).find((sound: { name: string }) => sound.name === original);
    const implicit = page.waitForResponse((response) => response.url().endsWith('/api/admin/library') &&
      ['sounds.rename', 'sounds.copy'].includes(response.request().postDataJSON()?.action));
    await editor.getByLabel('ชื่อเสียง').press('Enter');
    expect((await implicit).request().postDataJSON().action).toBe('sounds.rename');
    await expect(editor.getByRole('button', { name: 'บันทึกเสียง', exact: true })).toBeEnabled();
    const afterEnter = await context.request.post('/api/admin/library', {
      headers: { Origin: new URL(baseURL!).origin }, data: { action: 'sounds.list' },
    });
    const entered = (await afterEnter.json()).filter((sound: { name: string }) => sound.name === original);
    expect(entered).toHaveLength(1);
    expect(entered[0].id).toBe(first.id);
    first = entered[0];
    await expect(editor.getByRole('button', { name: 'บันทึกเป็นเสียงใหม่', exact: true })).toBeVisible();
    await editor.getByLabel('ชื่อเสียง').fill(copied);
    await editor.getByLabel('เริ่ม (วินาที)').fill('4');
    await editor.getByLabel('จบ (วินาที)').fill('7');
    await editor.getByRole('button', { name: 'บันทึกเป็นเสียงใหม่', exact: true }).click();
    await expect(page.getByText('บันทึกเป็นเสียงใหม่แล้ว', { exact: true })).toBeVisible();
    const response = await context.request.post('/api/admin/library', {
      headers: { Origin: new URL(baseURL!).origin }, data: { action: 'sounds.list' },
    });
    const sounds = await response.json();
    const unchanged = sounds.find((sound: { name: string }) => sound.name === original);
    const second = sounds.find((sound: { name: string }) => sound.name === copied);
    expect(unchanged).toEqual(first);
    expect(second.id).not.toBe(first.id);
    expect(second.duration_ms).toBe(3000);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('editor-mobile.png'), fullPage: true });
    const viewport = page.viewportSize()!;
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({ path: info.outputPath('editor-desktop.png'), fullPage: true });
    await page.setViewportSize(viewport);
    const download = await context.request.get(`/api/admin/download?id=${second.id}`);
    expect(download.ok()).toBe(true);
    expect(download.headers()['content-type']).toContain('audio/mpeg');
    expect(download.headers()['content-disposition']).toContain('attachment;');
    expect((await download.body()).length).toBeGreaterThan(1000);
    await page.getByRole('button', { name: `ลบ ${original}`, exact: true }).click();
    await page.getByRole('button', { name: 'ยืนยันการลบ', exact: true }).click();
    await expect(page.getByText('ลบเสียงแล้ว', { exact: true })).toBeVisible();
    expect((await context.request.get(`/api/admin/download?id=${second.id}`)).ok()).toBe(true);
    await page.getByRole('button', { name: `ลบ ${copied}`, exact: true }).click();
    await page.getByRole('button', { name: 'ยืนยันการลบ', exact: true }).click();
    await expect(page.getByText('ลบเสียงแล้ว', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: `ลบหมวด ${label}`, exact: true }).click();
    await page.getByRole('button', { name: 'ยืนยันลบหมวด', exact: true }).click();
    await expect(page.getByText('ลบหมวดหมู่แล้ว')).toBeVisible();
  } finally {
    const headers = { Origin: new URL(baseURL!).origin };
    if (categoryId) {
      const response = await context.request.post('/api/admin/library', { headers, data: { action: 'sounds.list' } });
      if (response.ok()) {
        const sounds = await response.json();
        for (const sound of sounds.filter((item: { category_id: string }) => item.category_id === categoryId)) {
          await context.request.post('/api/admin/library', { headers, data: { action: 'sounds.delete', id: sound.id, revision: sound.revision } });
        }
        await context.request.post('/api/admin/library', { headers, data: { action: 'categories.delete', id: categoryId } });
      }
    }
    await rm(dir, { recursive: true, force: true });
  }
});

test('imports the selected live YouTube recording and publishes four independent standby clips', async ({ page, context, baseURL }, info) => {
  test.skip(process.env.SOUNDPAD_TEST_YOUTUBE !== '1' || info.project.name !== 'Android Chromium', 'Opt-in live YouTube extraction on isolated local data.');
  const label = `YouTube ${Date.now()}`;
  const savedIds = new Set<string>();
  let categoryId = '';
  async function library(body: object) {
    const response = await context.request.post('/api/admin/library', { headers: { Origin: new URL(baseURL!).origin }, data: body });
    expect(response.ok()).toBe(true);
    return response.json();
  }
  try {
    await openAdmin(page);
    const category = await library({ action: 'categories.add', name: label });
    categoryId = category.id;
    await page.reload();
    await page.getByLabel('ลิงก์ YouTube').fill('https://www.youtube.com/watch?v=3F4_A1gulWs');
    const importedResponse = page.waitForResponse((response) => response.url().endsWith('/api/admin/youtube'));
    await page.getByRole('button', { name: 'นำเข้าเสียง', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('กำลังดึงและเตรียมเสียง');
    await expect(page.getByLabel('ลิงก์ YouTube')).toBeDisabled();
    const imported = await importedResponse;
    const payload = await imported.json();
    expect(imported.status(), payload.error).toBe(200);
    savedIds.add(payload.sound.id);
    const editor = page.getByRole('region', { name: 'ตัดเสียง' });
    await expect(editor).toBeVisible();
    await page.screenshot({ path: info.outputPath('youtube-import-mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({ path: info.outputPath('youtube-import-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 393, height: 851 });
    for (const [index, [form, start, end]] of [['Sword', 0, 11], ['Rod', 11, 24], ['Axe', 24, 34], ['Gun', 34, 44]].entries()) {
      await editor.getByLabel('ชื่อเสียง').fill(`${label} ${form}`);
      await editor.getByLabel('หมวดหมู่').selectOption(categoryId);
      await editor.getByLabel('เริ่ม (วินาที)').fill(String(start));
      await editor.getByLabel('จบ (วินาที)').fill(String(end));
      const savedResponse = page.waitForResponse((response) => response.url().endsWith('/api/admin/audio') && response.request().postDataJSON()?.action === 'save');
      await editor.getByRole('button', { name: index === 0 ? 'บันทึกเสียง' : 'บันทึกเป็นเสียงใหม่', exact: true }).click();
      const saved = await savedResponse;
      expect(saved.status()).toBe(200);
      const sound = await saved.json();
      savedIds.add(sound.id);
      expect(sound.duration_ms).toBe((Number(end) - Number(start)) * 1000);
      await expect(editor.getByLabel('ชื่อเสียง')).toHaveValue(`${label} ${form}`);
      const download = await context.request.get(`/api/admin/download?id=${sound.id}`);
      expect(download.ok()).toBe(true);
      expect((await download.body()).length).toBeGreaterThan(1000);
    }
    expect(savedIds.size).toBe(4);
    await page.goto('/');
    await page.getByRole('button', { name: label, exact: true }).click();
    for (const form of ['Sword', 'Rod', 'Axe', 'Gun']) await expect(page.getByRole('button', { name: new RegExp(`${label} ${form}`) })).toBeVisible();
    const sword = page.getByRole('button', { name: new RegExp(`${label} Sword`) });
    await sword.click();
    await expect(sword).toHaveAttribute('data-status', 'playing');
  } finally {
    const sounds = await library({ action: 'sounds.list' }).catch(() => []);
    for (const sound of sounds.filter((sound: { id: string; name: string }) => savedIds.has(sound.id) || sound.name.startsWith(label))) {
      await library({ action: 'sounds.delete', id: sound.id, revision: sound.revision });
    }
    if (categoryId) await library({ action: 'categories.delete', id: categoryId });
  }
});
