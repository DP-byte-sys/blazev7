import { appEnv, envBannerText, type AppEnv } from '../lib/appEnv';
import { Notice } from './Notice';

/** Reminds testers which environment they are in. Renders nothing in production. */
export function EnvBanner({ env = appEnv }: { env?: AppEnv }) {
  const text = envBannerText(env);
  return text ? <Notice tone="warning">{text}</Notice> : null;
}
