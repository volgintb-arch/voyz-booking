import { useEffect, useState } from 'react';
import { Icon } from '../../components/Icon';
import { Screen } from '../../components/Layout';
import { QrCode, qrSvg } from '../../components/QrCode';
import { SHARE_URL } from '../../config';
import { DICTS, useT } from '../../i18n';
import { shareUrl } from '../../share/links';
import { useHostProperty } from './useHostProperty';

/** A4 poster with the property QR: print it or save the QR as SVG. */
export function PosterScreen() {
  const { t } = useT();
  const { property } = useHostProperty();
  const [svgHref, setSvgHref] = useState<string | null>(null);
  const url = property ? shareUrl(SHARE_URL, property.slug, { src: 'qr' }) : '';

  useEffect(() => {
    if (!url) return;
    let href: string | null = null;
    void qrSvg(url).then((svg) => {
      href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      setSvgHref(href);
    });
    return () => {
      if (href) URL.revokeObjectURL(href);
    };
  }, [url]);

  if (!property) {
    return (
      <Screen title={t.promo.posterTitle} back="/host/promo">
        <p className="muted">{t.host.noProperties}</p>
      </Screen>
    );
  }

  return (
    <Screen title={t.promo.posterTitle} back={`/host/promo?p=${property.slug}`}>
      <div className="poster">
        <div className="posterBrand">
          VOYZ <span>booking</span>
        </div>
        <h2 className="title-caps">{property.name.ru}</h2>
        <p className="muted">{property.region.ru}</p>
        <div className="posterQr">
          <QrCode value={url} size={300} label={url} />
        </div>
        <div className="posterCall">
          {(['ru', 'ky', 'en'] as const).map((l) => (
            <span key={l}>{DICTS[l].promo.posterCall}</span>
          ))}
        </div>
        <p className="posterUrl">{url.replace(/^https?:\/\//, '').replace(/\?.*$/, '')}</p>
        <p className="muted tiny">{(['ru', 'ky', 'en'] as const).map((l) => DICTS[l].promo.posterScan).join(' · ')}</p>
      </div>
      <div className="actions noPrint">
        <button type="button" className="btn lime" onClick={() => window.print()}>
          <Icon name="printer" /> {t.promo.print}
        </button>
        {svgHref && (
          <a className="btn outline" href={svgHref} download={`voyz-qr-${property.slug}.svg`}>
            <Icon name="qr" /> {t.promo.downloadQr}
          </a>
        )}
      </div>
    </Screen>
  );
}
