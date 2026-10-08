import { describe, expect, it } from 'vitest';
import { appUrl, channelFor, shareUrl } from './links';

const BASE = 'https://voyz.kg/';

describe('share links', () => {
  it('builds a short link with source and dates', () => {
    expect(shareUrl(BASE, 'son-kul-aiyl', { src: 'instagram' })).toBe('https://voyz.kg/s/son-kul-aiyl/?src=instagram');
    expect(shareUrl(BASE, 'son-kul-aiyl', { src: 'whatsapp', checkIn: '2027-07-14', checkOut: '2027-07-17', guests: 3 })).toBe(
      'https://voyz.kg/s/son-kul-aiyl/?src=whatsapp&in=2027-07-14&out=2027-07-17&g=3',
    );
  });

  it('builds the in-app route for the site widget', () => {
    expect(appUrl(BASE, 'karakol-house', { src: 'site', embed: true })).toBe('https://voyz.kg/#/guest/p/karakol-house?src=site&embed=1');
  });

  it('maps link sources to the channel sent to Aynes', () => {
    expect(channelFor('instagram')).toBe('instagram');
    expect(channelFor('qr')).toBe('voyz');
    expect(channelFor('site')).toBe('voyz');
  });
});
