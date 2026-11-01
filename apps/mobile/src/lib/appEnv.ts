import Constants from 'expo-constants';

export type AppEnv = 'development' | 'uat' | 'staging' | 'production';
const ALL: AppEnv[] = ['development', 'uat', 'staging', 'production'];

/** Anything unknown or missing is treated as "development": the loud, safe direction (it shows the banner). */
export function parseAppEnv(value: unknown): AppEnv {
  return typeof value === 'string' && (ALL as string[]).includes(value)
    ? (value as AppEnv)
    : 'development';
}

/** Text for the environment banner; null in production. */
export function envBannerText(env: AppEnv): string | null {
  switch (env) {
    case 'production':
      return null;
    case 'uat':
      return 'UAT build: test data only. Do not enter real customer information.';
    case 'staging':
      return 'Staging build: release rehearsal. Do not enter real customer information.';
    default:
      return 'Development build: test data only.';
  }
}

export const appEnv: AppEnv = parseAppEnv(Constants.expoConfig?.extra?.appEnv);
