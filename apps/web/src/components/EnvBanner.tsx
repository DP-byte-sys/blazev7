import { appEnv, envBannerText, type AppEnv } from '../lib/appEnv';

/** Reminds people which environment they are in. Renders nothing in production. */
export function EnvBanner({ env = appEnv }: { env?: AppEnv }) {
  const text = envBannerText(env);
  return text ? (
    <div className="env-banner" role="note">
      {text}
    </div>
  ) : null;
}
