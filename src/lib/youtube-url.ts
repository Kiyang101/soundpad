export function youtubeVideoUrl(input: string): string | null {
  try {
    const url = new URL(input.trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    let id: string | null = null;
    if (url.hostname === 'youtu.be') {
      id = /^\/([\w-]{11})\/?$/.exec(url.pathname)?.[1] ?? null;
    } else if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname)) {
      id = url.pathname === '/watch' && url.searchParams.getAll('v').length === 1
        ? url.searchParams.get('v') : /^\/(?:shorts|embed)\/([\w-]{11})\/?$/.exec(url.pathname)?.[1] ?? null;
    }
    return id && /^[\w-]{11}$/.test(id) ? `https://www.youtube.com/watch?v=${id}` : null;
  } catch {
    return null;
  }
}
