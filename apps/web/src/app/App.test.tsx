import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { StatusBadge } from '../components/Badges';
import { STATUS_TONE } from '../theme/statusTone';
import { renderApp } from '../test/renderApp';
import { contrastRatio } from '../theme/contrast';
import { colors } from '../theme/tokens';

const renderAt = async (path: string) => {
  const r = renderApp(path);
  await screen.findByRole('main');
  return r;
};

describe('web shell', () => {
  it('renders main navigation with admin and account links', async () => {
    await renderAt('/');
    const nav = screen.getByRole('navigation', { name: 'Main' });
    for (const name of [
      'Overview',
      'Ticket queue',
      'Categories',
      'Users and roles',
      'Settings / profile',
    ]) {
      expect(nav).toHaveTextContent(name);
    }
  });

  it('has a skip-to-content link', async () => {
    await renderAt('/');
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main');
  });

  it('navigates from queue to ticket detail', async () => {
    await renderAt('/tickets');
    await userEvent.click(await screen.findByRole('link', { name: 'BLZ-0001' }));
    expect(
      await screen.findByRole('heading', { name: 'Cannot connect to office Wi-Fi' }),
    ).toBeInTheDocument();
  });

  it('shows an error state for an unknown ticket', async () => {
    await renderAt('/tickets/does-not-exist');
    expect(await screen.findByRole('alert')).toHaveTextContent('Ticket not found');
  });

  it('shows status as a text label', () => {
    render(<StatusBadge status="reopened" />);
    expect(screen.getByText('Reopened')).toBeInTheDocument();
  });

  it('mobile menu button toggles aria-expanded', async () => {
    await renderAt('/');
    const btn = screen.getByRole('button', { name: 'Menu' });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('design token contrast (WCAG AA 4.5:1)', () => {
  const pairs: [string, string, string][] = [
    ['text on background', colors.textPrimary, colors.background],
    ['secondary text on surface', colors.textSecondary, colors.surface],
    ['secondary text on background', colors.textSecondary, colors.background],
    ['inverse on brand900 (sidebar)', colors.textInverse, colors.brand900],
    ['brand100 on brand900 (nav links)', colors.brand100, colors.brand900],
    ['brand100 on brand800 (nav hover)', colors.brand100, colors.brand800],
    ['inverse on brand700 (button/active nav)', colors.textInverse, colors.brand700],
    ['brand700 on surface (links, outline button)', colors.brand700, colors.surface],
    ['danger on surface', colors.danger, colors.surface],
    ['info on infoBg (notice)', colors.info, colors.infoBg],
  ];
  it.each(pairs)('%s', (_n, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
  it.each(Object.entries(STATUS_TONE))('status badge %s', (_s, tone) => {
    expect(contrastRatio(tone.fg, tone.bg)).toBeGreaterThanOrEqual(4.5);
  });
});
