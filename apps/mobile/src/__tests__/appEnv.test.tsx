import { render, screen } from '@testing-library/react-native';
import { EnvBanner } from '../components/EnvBanner';
import { envBannerText, parseAppEnv } from '../lib/appEnv';
import appConfig, { buildConfig, DEFAULT_PACKAGE_BASE, resolveAppEnv } from '../../app.config';

describe('environment awareness', () => {
  it('treats unknown or missing values as development', () => {
    expect(parseAppEnv(undefined)).toBe('development');
    expect(parseAppEnv('prod')).toBe('development');
    expect(parseAppEnv('staging')).toBe('staging');
  });
  it('shows a banner everywhere except production', async () => {
    expect(envBannerText('production')).toBeNull();
    await render(<EnvBanner env="uat" />);
    expect(screen.getByText(/UAT build: test data only/)).toBeTruthy();
  });
  it('renders nothing in production', async () => {
    await render(<EnvBanner env="production" />);
    expect(screen.queryByText(/test data/)).toBeNull();
  });
});

describe('app.config (one codebase, four installable variants)', () => {
  const base = {
    name: 'Blaze',
    slug: 'blaze',
    android: { predictiveBackGestureEnabled: false },
    extra: {},
  };
  it.each([
    ['development', 'Blaze (Dev)', 'blaze-development', 'com.acme.blaze.dev'],
    ['uat', 'Blaze (UAT)', 'blaze-uat', 'com.acme.blaze.uat'],
    ['staging', 'Blaze (Staging)', 'blaze-staging', 'com.acme.blaze.staging'],
    ['production', 'Blaze', 'blaze', 'com.acme.blaze'],
  ] as const)('%s', (env, name, scheme, pkg) => {
    const c = buildConfig(base, env, 'com.acme.blaze');
    expect(c).toMatchObject({
      name,
      scheme,
      android: { package: pkg, predictiveBackGestureEnabled: false },
      extra: { appEnv: env },
    });
  });
  it('keeps every other setting from app.json', () => {
    expect(buildConfig({ ...base, version: '1.0.0' }, 'uat', 'com.acme.blaze').version).toBe(
      '1.0.0',
    );
  });
  it('refuses a production build that still uses the placeholder package id', () => {
    expect(() => buildConfig(base, 'production', undefined)).toThrow(/ANDROID_PACKAGE_BASE/);
    expect(() => buildConfig(base, 'production', DEFAULT_PACKAGE_BASE)).toThrow(/placeholder/);
    expect(buildConfig(base, 'uat', undefined).android?.package).toBe('com.example.blaze.uat'); // non-production may use the placeholder
  });
  it('rejects an unknown APP_ENV instead of silently building the wrong variant', () => {
    expect(() => resolveAppEnv('prod')).toThrow(/APP_ENV/);
    expect(resolveAppEnv(undefined)).toBe('development');
  });
  it('exports a config function for Expo', () => {
    expect(typeof appConfig).toBe('function');
  });
});
