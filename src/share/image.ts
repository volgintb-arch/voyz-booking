/**
 * Shrinks a photo on the phone before upload: long side ≤ maxSide, JPEG.
 * A 12 MP camera shot (~4 MB) becomes ~200–350 KB — uploads fine on weak mobile internet.
 */
export async function shrinkImage(file: File, maxSide: number, quality: number): Promise<{ dataUrl: string; width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.round(img.naturalWidth * k);
    const height = Math.round(img.naturalHeight * k);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const g = canvas.getContext('2d');
    if (!g) throw new Error('canvas');
    g.fillStyle = '#fff'; // transparent PNGs get a white background in JPEG
    g.fillRect(0, 0, width, height);
    g.drawImage(img, 0, 0, width, height);
    return { dataUrl: canvas.toDataURL('image/jpeg', quality), width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}
