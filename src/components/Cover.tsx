import type { PropertyKind } from '../domain/types';

/** Placeholder illustration until hosts upload photos. */
export function Cover({ kind, hue }: { kind: PropertyKind; hue: number }) {
  const sky = `hsl(${hue} 55% 82%)`;
  const far = `hsl(${hue} 25% 62%)`;
  const near = `hsl(${hue} 35% 42%)`;
  const ground = `hsl(${(hue + 40) % 360} 35% 55%)`;
  return (
    <svg className="cover" viewBox="0 0 320 140" role="img" aria-hidden>
      <rect width="320" height="140" fill={sky} />
      <circle cx="262" cy="34" r="14" fill="#fff6d8" />
      <path d="M0 92 L48 46 L82 74 L130 30 L178 80 L214 52 L262 90 L320 60 V140 H0Z" fill={far} />
      <path d="M130 30 l-12 12 l8 -2 l4 6 l4 -6 l8 2Z" fill="#fff" opacity="0.85" />
      <path d="M0 110 Q80 88 160 104 T320 100 V140 H0Z" fill={near} />
      <rect y="118" width="320" height="22" fill={ground} />
      {kind === 'yurt_camp' && (
        <g fill="#fbf7ef" stroke="#7b5b3a" strokeWidth="1.5">
          {[70, 140, 210].map((x) => (
            <g key={x} transform={`translate(${x} 96)`}>
              <path d="M-20 22 V8 Q0 -6 20 8 V22Z" />
              <path d="M-8 22 V12 H8 V22" fill="#c0392b" />
              <circle cx="0" cy="-1" r="3" fill="#7b5b3a" stroke="none" />
            </g>
          ))}
        </g>
      )}
      {kind === 'guest_house' && (
        <g transform="translate(120 74)" stroke="#5a3e2b" strokeWidth="1.5">
          <path d="M0 30 L40 0 L80 30Z" fill="#b5523b" />
          <rect x="8" y="30" width="64" height="40" fill="#f3e6cf" />
          <rect x="18" y="40" width="14" height="14" fill="#8fc1e3" />
          <rect x="48" y="44" width="14" height="26" fill="#7b5b3a" />
        </g>
      )}
      {(kind === 'glamping' || kind === 'resort') && (
        <g fill="#ffffffcc" stroke="#4b6b7a" strokeWidth="1.5">
          {[90, 170, 240].map((x) => (
            <g key={x} transform={`translate(${x} 118)`}>
              <path d="M-24 0 A24 24 0 0 1 24 0Z" />
              <path d="M-12 -21 L0 0 L12 -21 M-24 0 L0 -24 L24 0" fill="none" />
            </g>
          ))}
        </g>
      )}
    </svg>
  );
}
