import { describe, expect, it } from 'vitest';

import { DEFAULT_REDIRECT_PATH, safeRedirectPath } from './redirect-target';

/**
 * POST-SIGN-IN REDIRECT TARGETS
 * =============================
 * `?next=` arrives from the query string, so every value here is something an
 * attacker can put in a link. The sign-in form honours it, which means an
 * unvalidated value turns a link to the school's real sign-in page into a
 * credential-harvesting step: the victim types their genuine password into a
 * genuine form on a genuine domain, and is then handed to the attacker's site
 * at the moment they are most inclined to trust what is on screen.
 *
 * These tests are the security boundary. Each rejected shape below is a real
 * navigation to somewhere other than this origin.
 */
describe('safeRedirectPath - only same-origin paths are honoured', () => {
  it('accepts the ordinary internal destinations', () => {
    expect(safeRedirectPath('/dashboard')).toBe('/dashboard');
    expect(safeRedirectPath('/students')).toBe('/students');
    expect(safeRedirectPath('/payroll/2026/term-1')).toBe('/payroll/2026/term-1');
  });

  it('accepts a path carrying a query string', () => {
    expect(safeRedirectPath('/students?status=active')).toBe('/students?status=active');
  });

  it('rejects an absolute URL to another origin', () => {
    expect(safeRedirectPath('https://evil.invalid/steal')).toBeNull();
    expect(safeRedirectPath('http://evil.invalid')).toBeNull();
  });

  it('rejects a protocol-relative URL, which passes a naive leading-slash check', () => {
    // The reason this needs its own case: '//evil.invalid' starts with '/'.
    expect('//evil.invalid'.startsWith('/')).toBe(true);
    expect(safeRedirectPath('//evil.invalid')).toBeNull();
  });

  it('rejects a backslash, which browsers normalise into a protocol-relative URL', () => {
    expect(safeRedirectPath('/\\evil.invalid')).toBeNull();
  });

  it('rejects a non-http scheme', () => {
    expect(safeRedirectPath('javascript:alert(1)')).toBeNull();
    expect(safeRedirectPath('data:text/html,<script>alert(1)</script>')).toBeNull();
  });

  it('rejects empty and missing values', () => {
    expect(safeRedirectPath('')).toBeNull();
    expect(safeRedirectPath(null)).toBeNull();
    expect(safeRedirectPath(undefined)).toBeNull();
  });

  it('names a same-origin default for every rejected value', () => {
    // The point of returning null rather than repairing: the caller always has
    // somewhere safe to go, and never depends on our URL parsing to get there.
    expect(safeRedirectPath('https://evil.invalid') ?? DEFAULT_REDIRECT_PATH).toBe('/dashboard');
    expect(DEFAULT_REDIRECT_PATH.startsWith('/')).toBe(true);
  });
});
