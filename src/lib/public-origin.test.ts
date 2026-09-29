import { describe, expect, it } from 'vitest';

import { normaliseOrigin, publicOrigin, requestOrigin } from './public-origin';

/**
 * PUBLIC ORIGIN
 * =============
 * This function decides the address a sitemap and a robots.txt tell the
 * internet the school lives at. It exists because the first version of this
 * used the `http://localhost:3000` default that `serverEnv` supplies for the
 * application, and shipped a live production sitemap reading
 * `http://localhost:3000/` - a wrong address, published to every crawler,
 * correctable only by rebuilding.
 *
 * The rule under test: never publish an address that was not actually observed.
 * Either the operator configured one, or the host serving the request is it.
 * Anything else is a guess, and a guess in a canonical-URL field is not a small
 * mistake.
 */
describe('normaliseOrigin', () => {
  it('keeps an absolute origin and strips a trailing slash', () => {
    expect(normaliseOrigin('https://school.example.com')).toBe('https://school.example.com');
    expect(normaliseOrigin('https://school.example.com/')).toBe('https://school.example.com');
    expect(normaliseOrigin('https://school.example.com///')).toBe('https://school.example.com');
  });

  it('keeps a port, which is part of the address', () => {
    expect(normaliseOrigin('http://localhost:3000')).toBe('http://localhost:3000');
  });

  it('rejects anything that is not an absolute http(s) origin', () => {
    // A relative value cannot be published in a <loc>; only a host is given.
    expect(normaliseOrigin('/')).toBeNull();
    expect(normaliseOrigin('school.example.com')).toBeNull();
    expect(normaliseOrigin('ftp://school.example.com')).toBeNull();
    expect(normaliseOrigin('javascript:alert(1)')).toBeNull();
  });

  it('rejects a value carrying a path, whitespace or nothing at all', () => {
    expect(normaliseOrigin('https://school.example.com/sitemap.xml')).toBeNull();
    expect(normaliseOrigin('https://school.example.com/ evil')).toBeNull();
    expect(normaliseOrigin('')).toBeNull();
    expect(normaliseOrigin('   ')).toBeNull();
    expect(normaliseOrigin(null)).toBeNull();
    expect(normaliseOrigin(undefined)).toBeNull();
  });
});

describe('requestOrigin', () => {
  it('builds the origin of the host actually serving the request', () => {
    expect(requestOrigin('school.example.com', 'https')).toBe('https://school.example.com');
    expect(requestOrigin('school.example.com:8443', 'http')).toBe('http://school.example.com:8443');
  });

  it('assumes https when the scheme header is absent or unrecognised', () => {
    // A deployment terminating TLS always forwards the real scheme, so an
    // absent one means an edge that did not say. https is the safe direction:
    // a redundant https in a sitemap is harmless, a wrong http would have
    // crawlers fetch the address over plaintext.
    expect(requestOrigin('school.example.com', null)).toBe('https://school.example.com');
    expect(requestOrigin('school.example.com', 'gopher')).toBe('https://school.example.com');
  });

  it('publishes nothing when there is no host to read', () => {
    expect(requestOrigin(null, 'https')).toBeNull();
    expect(requestOrigin('', 'https')).toBeNull();
  });
});

describe('publicOrigin', () => {
  it('prefers the configured origin over the request host', () => {
    // The operator's value is the canonical one, and it outranks whatever host
    // happens to be in front of the app.
    expect(
      publicOrigin({ configured: 'https://school.example.com', host: 'preview.internal' }),
    ).toBe('https://school.example.com');
  });

  it('falls back to the request host when nothing is configured', () => {
    // The case that shipped the bug: an unset variable must not become
    // http://localhost:3000 in production.
    expect(publicOrigin({ configured: undefined, host: 'school.example.com' })).toBe(
      'https://school.example.com',
    );
  });

  it('falls back when the configured value is unusable', () => {
    expect(publicOrigin({ configured: 'not-a-url', host: 'school.example.com' })).toBe(
      'https://school.example.com',
    );
  });

  it('publishes nothing rather than guessing when neither source is available', () => {
    // The contract the callers depend on: null means "omit the claim", so an
    // unresolvable origin can never become a wrong address in a document.
    expect(publicOrigin({})).toBeNull();
    expect(publicOrigin({ configured: null, host: null })).toBeNull();
  });

  it('never produces a localhost address it did not observe', () => {
    // A host header of localhost:3000 is a real observation, so it is allowed -
    // that is a developer running the app. What is forbidden is manufacturing
    // one when nothing said so.
    expect(publicOrigin({ host: 'localhost:3000', scheme: 'http' })).toBe('http://localhost:3000');

    // Nothing observed at all, so nothing published. The cast keeps the
    // assertion on the string, since the contract is a null, not a string.
    expect((publicOrigin({}) ?? '') as string).not.toContain('localhost');
  });
});
