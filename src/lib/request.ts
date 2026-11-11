export async function adminRequest<T>(endpoint: 'login' | 'library' | 'audio' | 'youtube', body: object, method = 'POST'): Promise<T> {
  const response = await fetch(`/api/admin/${endpoint}`, {
    method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error ?? (response.status === 429
      ? 'ลองเข้าสู่ระบบบ่อยเกินไป กรุณารอหนึ่งนาที'
      : 'ดำเนินการไม่สำเร็จ กรุณาลองอีกครั้ง'));
  }
  return payload as T;
}
