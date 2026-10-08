import { describe, expect, it } from 'vitest';
import { scrubUrl } from './monitoring';

describe('scrubUrl', () => {
  it('cuts guest tokens out of URLs before they reach Sentry', () => {
    expect(scrubUrl('https://app.test/#/guest/open/VZ-2027-1001?t=abc_DEF-123')).toBe('https://app.test/#/guest/open/VZ-2027-1001?t=[filtered]');
    expect(scrubUrl('https://x.test/a?src=instagram&token=s3cret&g=2')).toBe('https://x.test/a?src=instagram&token=[filtered]&g=2');
    expect(scrubUrl('https://x.test/#/guest/p/son-kul?src=qr')).toBe('https://x.test/#/guest/p/son-kul?src=qr');
  });
});
