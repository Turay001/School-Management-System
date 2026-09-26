import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime, formatPeriodLabel, timeAgo } from './format';

describe('formatDate', () => {
  it('formats ISO dates in the local calendar day, en-GB style', () => {
    // September's en-GB abbreviation differs between runtime ICU ("Sept") and
    // browser ICU ("Sep"), so the test accepts either spelling.
    expect(formatDate('2026-09-14T14:30:00Z')).toMatch(/14 (Sep|Sept) 2026/);
  });

  it('renders null and garbage safely', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate('not-a-date')).toBe('—');
  });
});

describe('formatDateTime', () => {
  it('includes a time', () => {
    expect(formatDateTime('2026-09-14T14:30:00Z')).toMatch(/14 (Sep|Sept) 2026/);
  });
});

describe('timeAgo', () => {
  it('reports recent activity', () => {
    expect(timeAgo(new Date().toISOString())).toBe('just now');
    const tenMinutes = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    expect(timeAgo(tenMinutes)).toBe('10 minutes ago');
  });

  it('falls back to a date for distant past', () => {
    // Midday UTC keeps the calendar day identical in every real-world offset.
    expect(timeAgo('2020-06-15T12:00:00Z')).toMatch(/15 Jun 2020/);
  });
});

describe('formatPeriodLabel', () => {
  it('names months for payroll periods', () => {
    expect(formatPeriodLabel(2026, 9)).toBe('September 2026');
    expect(formatPeriodLabel(2026, 12)).toBe('December 2026');
    expect(formatPeriodLabel(2026, 1)).toBe('January 2026');
  });

  it('degrades safely for an unknown month', () => {
    expect(formatPeriodLabel(2026, 13)).toBe('2026-13');
  });
});