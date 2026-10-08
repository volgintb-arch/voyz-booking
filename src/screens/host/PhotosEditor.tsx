import { useState, type ChangeEvent } from 'react';
import { HelpLink } from '../../components/HelpLink';
import { Icon } from '../../components/Icon';
import type { Property } from '../../domain/types';
import { useActions, type Result } from '../../data/actions';
import { photosOf } from '../../data/state';
import { useStore } from '../../data/store';
import { useT } from '../../i18n';

/** Upload from the phone gallery or camera; the first photo is the cover. */
export function PhotosEditor({ property, onDone }: { property: Property; onDone: (r: Result) => void }) {
  const { state } = useStore();
  const { t } = useT();
  const actions = useActions();
  const photos = photosOf(state, property.id);
  const [selected, setSelected] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const upload = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = '';
    if (!files.length) return;
    setProgress({ done: 0, total: files.length });
    let last: Result = { ok: true, value: null };
    for (const [i, f] of files.entries()) {
      last = await actions.addPhoto(property.id, f);
      setProgress({ done: i + 1, total: files.length });
      if (!last.ok) break;
    }
    setProgress(null);
    onDone(last);
  };

  const current = photos.find((p) => p.id === selected);

  return (
    <div className="stack">
      <p className="muted small">{t.photos.hint}</p>
      <HelpLink article="photos" />
      <div className="photoGrid">
        {photos.map((p, i) => (
          <button
            key={p.id}
            type="button"
            className="photoCell"
            aria-pressed={selected === p.id}
            onClick={() => setSelected(selected === p.id ? null : p.id)}
          >
            <img src={p.url} alt="" loading="lazy" />
            {i === 0 && <span className="badge confirmed">{t.photos.cover}</span>}
          </button>
        ))}
        <label className="photoAdd">
          {progress ? (
            <span>{t.photos.uploading(progress.done, progress.total)}</span>
          ) : (
            <span className="stack" style={{ alignItems: 'center', gap: 4 }}>
              <Icon name="upload" />
              {t.photos.add}
            </span>
          )}
          <input type="file" accept="image/*" multiple onChange={upload} disabled={!!progress} style={{ display: 'none' }} />
        </label>
      </div>
      {current && (
        <div className="actions">
          {photos[0]?.id !== current.id && (
            <button type="button" className="btn small lime" onClick={async () => onDone(await actions.makeCover(property.id, current.id))}>
              {t.photos.makeCover}
            </button>
          )}
          <button
            type="button"
            className="btn small danger"
            onClick={async () => {
              if (!window.confirm(t.photos.confirmDelete)) return;
              setSelected(null);
              onDone(await actions.removePhoto(current.id));
            }}
          >
            {t.common.delete}
          </button>
        </div>
      )}
    </div>
  );
}
