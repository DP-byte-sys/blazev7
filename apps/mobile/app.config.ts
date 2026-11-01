import type { ConfigContext, ExpoConfig } from 'expo/config';

// One codebase, four installable variants. APP_ENV selects the variant so DEV, UAT, staging and production builds can be
// installed side by side on one phone and can never be confused (different name, scheme and Android package).
// Set APP_ENV per EAS build profile (eas.json). Static settings stay in app.json.
export const APP_ENVS = ['development', 'uat', 'staging', 'production'] as const;
export type AppEnv = (typeof APP_ENVS)[number];

const SUFFIX: Record<AppEnv, string> = {
  development: '.dev',
  uat: '.uat',
  staging: '.staging',
  production: '',
};
const LABEL: Record<AppEnv, string> = {
  development: 'Blaze (Dev)',
  uat: 'Blaze (UAT)',
  staging: 'Blaze (Staging)',
  production: 'Blaze',
};

/** Owner decision: replace this with your own reverse-domain id before the first real build (ADR 0008 F6). It cannot be changed after publishing. */
export const DEFAULT_PACKAGE_BASE = 'com.example.blaze';

export function resolveAppEnv(value: string | undefined): AppEnv {
  if (!value) return 'development';
  if ((APP_ENVS as readonly string[]).includes(value)) return value as AppEnv;
  throw new Error(`APP_ENV must be one of ${APP_ENVS.join(', ')} (got "${value}")`);
}

export function buildConfig(
  config: Partial<ExpoConfig>,
  env: AppEnv,
  packageBase: string | undefined,
): ExpoConfig {
  const base = packageBase?.trim() || DEFAULT_PACKAGE_BASE;
  if (env === 'production' && base === DEFAULT_PACKAGE_BASE) {
    throw new Error(
      'Production builds need ANDROID_PACKAGE_BASE (your own reverse-domain id, e.g. com.yourcompany.blaze). Refusing to build with the placeholder.',
    );
  }
  return {
    ...config,
    name: LABEL[env],
    slug: config.slug ?? 'blaze',
    scheme: env === 'production' ? 'blaze' : `blaze-${env}`,
    android: { ...config.android, package: `${base}${SUFFIX[env]}` },
    extra: { ...config.extra, appEnv: env },
  };
}

export default ({ config }: ConfigContext): ExpoConfig =>
  buildConfig(config, resolveAppEnv(process.env.APP_ENV), process.env.ANDROID_PACKAGE_BASE);
