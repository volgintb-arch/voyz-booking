/** Copies text; falls back to a hidden textarea for older WebViews. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** System share sheet when available (phones), otherwise false. */
export async function shareNative(title: string, url: string): Promise<boolean> {
  if (!navigator.share) return false;
  try {
    await navigator.share({ title, url });
    return true;
  } catch {
    return false;
  }
}
