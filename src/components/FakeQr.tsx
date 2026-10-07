/** Deterministic QR-looking pattern for the demo payment screen (not a real QR). */
export function FakeQr({ seed }: { seed: string }) {
  const size = 25;
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const rnd = () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return (h >>> 0) / 4294967296;
  };
  const finder = (x: number, y: number) => {
    const inBox = (ox: number, oy: number) => x >= ox && x < ox + 7 && y >= oy && y < oy + 7;
    for (const [ox, oy] of [[0, 0], [size - 7, 0], [0, size - 7]] as const) {
      if (inBox(ox, oy)) {
        const dx = x - ox;
        const dy = y - oy;
        const ring = Math.min(dx, dy, 6 - dx, 6 - dy);
        return ring === 0 || ring >= 2;
      }
    }
    return null;
  };
  const cells: string[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const f = finder(x, y);
      if (f ?? rnd() > 0.52) cells.push(`M${x} ${y}h1v1h-1z`);
    }
  }
  return (
    <svg className="qr" viewBox={`0 0 ${size} ${size}`} role="img" aria-label="QR">
      <path d={cells.join('')} fill="#111" />
    </svg>
  );
}
