// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RecoveryRescue } from '../recovery-rescue';

/**
 * RECOVERY RESCUE
 * ===============
 * The bug this guards against is silent, which is why it needs a test rather
 * than a code review: with the Supabase Redirect URLs allow-list missing the
 * callback path, a password-reset link is built from the Site URL instead and
 * arrives at the landing page as a bare `?code=...`. Nothing exchanges it, so
 * the reset does nothing and the application reports no error to anyone.
 *
 * The first test below is the reported failure, reproduced exactly.
 */

interface StubbedLocation {
  search: string;
  replace: ReturnType<typeof vi.fn>;
  assign: ReturnType<typeof vi.fn>;
}

/**
 * jsdom's real `location` cannot be navigated, so it is replaced wholesale.
 * `assign` is stubbed alongside `replace` so the tests can assert which one
 * the component chose - the difference is whether a single-use recovery code is
 * left in this tab's history.
 */
function stubLocation(search: string): StubbedLocation {
  const stub: StubbedLocation = { search, replace: vi.fn(), assign: vi.fn() };
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: stub,
  });
  return stub;
}

function targetOf(stub: StubbedLocation): URL {
  const call = stub.replace.mock.calls[0];
  if (!call) throw new Error('no navigation happened');
  return new URL(call[0] as string, 'https://school.example.com');
}

describe('RecoveryRescue - a rejected reset redirect still completes', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('forwards the bare ?code= that the Supabase Site URL fallback produces', () => {
    // Exactly the reported link, minus the code value.
    const stub = stubLocation('?code=08a8f9d6-abbf-49ef-9b2c-f5b9bdac30b6');

    render(<RecoveryRescue />);

    const target = targetOf(stub);
    expect(target.pathname).toBe('/auth/callback');
    expect(target.searchParams.get('code')).toBe('08a8f9d6-abbf-49ef-9b2c-f5b9bdac30b6');
    // A recovery code must land on the set-new-password screen, not sign-in.
    expect(target.searchParams.get('type')).toBe('recovery');
    expect(target.searchParams.get('next')).toBe('/login');
  });

  it('carries an explicit next and type through untouched', () => {
    const stub = stubLocation('?code=abc123&next=%2Fstaff&type=email');

    render(<RecoveryRescue />);

    const target = targetOf(stub);
    expect(target.searchParams.get('next')).toBe('/staff');
    expect(target.searchParams.get('type')).toBe('email');
  });

  it('replaces rather than assigns, keeping the code out of history', () => {
    const stub = stubLocation('?code=abc123');

    render(<RecoveryRescue />);

    expect(stub.replace).toHaveBeenCalledTimes(1);
    expect(stub.assign).not.toHaveBeenCalled();
  });

  it('does nothing on an ordinary visit to the landing page', () => {
    const stub = stubLocation('');

    render(<RecoveryRescue />);

    expect(stub.replace).not.toHaveBeenCalled();
    expect(stub.assign).not.toHaveBeenCalled();
  });

  it('does nothing when the query string holds other parameters', () => {
    const stub = stubLocation('?utm_source=whatsapp&ref=parent');

    render(<RecoveryRescue />);

    expect(stub.replace).not.toHaveBeenCalled();
  });

  it('ignores an empty code rather than forwarding a broken request', () => {
    const stub = stubLocation('?code=');

    render(<RecoveryRescue />);

    expect(stub.replace).not.toHaveBeenCalled();
  });

  it('renders nothing into the page', () => {
    const { container } = render(<RecoveryRescue />);
    expect(container.innerHTML).toBe('');
  });
});
