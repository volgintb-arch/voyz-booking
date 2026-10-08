import { useState } from 'react';
import type { Photo, PropertyKind } from '../domain/types';
import { Cover } from './Cover';

/** Cover photo of a property, or the illustration until the host uploads one. */
export function PropertyPhoto({ kind, hue, photos, alt }: { kind: PropertyKind; hue: number; photos: Photo[]; alt: string }) {
  const cover = photos[0];
  if (!cover) return <Cover kind={kind} hue={hue} />;
  return <img className="cover photo" src={cover.url} alt={alt} loading="lazy" decoding="async" />;
}

/** Swipeable gallery (scroll-snap, works with fingers and mouse wheel). */
export function Gallery({ kind, hue, photos, alt }: { kind: PropertyKind; hue: number; photos: Photo[]; alt: string }) {
  const [index, setIndex] = useState(0);
  if (photos.length < 2) return <PropertyPhoto kind={kind} hue={hue} photos={photos} alt={alt} />;
  return (
    <div className="gallery">
      <div
        className="galleryTrack"
        onScroll={(e) => {
          const el = e.currentTarget;
          setIndex(Math.round(el.scrollLeft / el.clientWidth));
        }}
      >
        {photos.map((p, i) => (
          <img key={p.id} className="cover photo" src={p.url} alt={`${alt} ${i + 1}`} loading={i === 0 ? 'eager' : 'lazy'} decoding="async" />
        ))}
      </div>
      <span className="galleryCount">
        {index + 1} / {photos.length}
      </span>
    </div>
  );
}
