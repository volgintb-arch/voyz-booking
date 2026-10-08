import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

/** Real, scannable QR code rendered as inline SVG. */
export function QrCode({ value, size = 220, label }: { value: string; size?: number; label?: string }) {
  const [svg, setSvg] = useState<string>('');
  useEffect(() => {
    let alive = true;
    QRCode.toString(value, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#1e1e1e', light: '#ffffff' } })
      .then((s) => alive && setSvg(s))
      .catch(() => alive && setSvg(''));
    return () => {
      alive = false;
    };
  }, [value]);
  return (
    <div
      className="qrBox"
      role="img"
      aria-label={label ?? value}
      style={{ width: size, height: size }}
      // qrcode returns a self-contained SVG string built from our own value
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export async function qrSvg(value: string): Promise<string> {
  return QRCode.toString(value, { type: 'svg', margin: 2, errorCorrectionLevel: 'M' });
}
