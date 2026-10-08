import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Field } from '../../components/Layout';
import { Icon } from '../../components/Icon';
import type { Property } from '../../domain/types';
import { updateProperty } from '../../data/state';
import { useStore } from '../../data/store';
import { useT } from '../../i18n';

const HOLD_CHOICES = [2, 6, 12, 24, 48];

/** Shrinks the uploaded bank QR so it fits device storage (and later the API). */
function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const max = 640;
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * k);
        canvas.height = Math.round(img.height * k);
        canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

/** Host's own QR and requisites for deposits (D-001, stage 1). */
export function PaymentSettings({ property, onSaved }: { property: Property; onSaved: () => void }) {
  const { update } = useStore();
  const { t } = useT();
  const [qrImage, setQrImage] = useState(property.payment.qrImage);
  const [recipient, setRecipient] = useState(property.payment.recipient);
  const [details, setDetails] = useState(property.payment.details);
  const [holdHours, setHoldHours] = useState(property.payment.holdHours);
  const [error, setError] = useState<string | null>(null);

  const pick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setQrImage(await readImage(file));
      setError(null);
    } catch {
      setError(t.payment.badImage);
    }
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    update((s) => updateProperty(s, property.id, { payment: { qrImage, recipient: recipient.trim(), details: details.trim(), holdHours } }));
    onSaved();
  };

  return (
    <form className="stack" onSubmit={save}>
      <p className="small">{t.payment.intro}</p>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div className="qrUpload">{qrImage ? <img src={qrImage} alt={t.payment.qr} /> : <Icon name="qr" size={48} />}</div>
        <div className="stack" style={{ flex: 1 }}>
          <label className="btn small outline" style={{ cursor: 'pointer' }}>
            <Icon name="upload" size={18} /> {qrImage ? t.payment.replaceQr : t.payment.uploadQr}
            <input type="file" accept="image/*" onChange={pick} style={{ display: 'none' }} />
          </label>
          {qrImage && (
            <button type="button" className="btn small danger" onClick={() => setQrImage(null)}>
              {t.common.delete}
            </button>
          )}
          <span className="muted tiny">{t.payment.qrHint}</span>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      <Field label={t.payment.recipient}>
        <input value={recipient} onChange={(e) => setRecipient(e.target.value)} maxLength={60} />
      </Field>
      <Field label={t.payment.details} hint={t.payment.detailsHint}>
        <input value={details} onChange={(e) => setDetails(e.target.value)} maxLength={80} />
      </Field>
      <span className="muted small">{t.payment.holdLabel}</span>
      <div className="chips">
        {HOLD_CHOICES.map((h) => (
          <button key={h} type="button" className="chip" aria-pressed={holdHours === h} onClick={() => setHoldHours(h)}>
            {t.payment.hours(h)}
          </button>
        ))}
      </div>
      <button type="submit" className="btn small lime">
        {t.common.save}
      </button>
    </form>
  );
}
