import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EnvBanner } from '../components/EnvBanner';
import { envBannerText, parseAppEnv } from './appEnv';

describe('environment awareness', () => {
  it('treats unknown or missing values as development (the loud, safe direction)', () => {
    expect(parseAppEnv(undefined)).toBe('development');
    expect(parseAppEnv('prod')).toBe('development');
    expect(parseAppEnv('uat')).toBe('uat');
    expect(parseAppEnv('production')).toBe('production');
  });
  it('shows a banner in every environment except production', () => {
    expect(envBannerText('production')).toBeNull();
    for (const e of ['development', 'uat', 'staging'] as const)
      expect(envBannerText(e)).toMatch(/test data|rehearsal/);
  });
  it('renders a note for UAT and nothing for production', () => {
    const { unmount } = render(<EnvBanner env="uat" />);
    expect(screen.getByRole('note')).toHaveTextContent('UAT environment: test data only');
    unmount();
    render(<EnvBanner env="production" />);
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });
});
