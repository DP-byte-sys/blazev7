import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { EnvBanner } from '../../components/EnvBanner';
import { useAuth } from './AuthProvider';

export function LoginPage() {
  const { status, notice, signIn } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});

  if (status === 'signedIn') {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from && from.startsWith('/') && from !== '/login' ? from : '/'} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (!email.trim()) next.email = 'Enter your email address.';
    if (!password) next.password = 'Enter your password.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setSubmitting(true);
    const result = await signIn(email, password);
    setSubmitting(false);
    if (!result.ok) setErrors({ form: result.message });
  }

  return (
    <main className="login">
      <EnvBanner />
      <h1>Sign in to Blaze</h1>
      <p className="muted">Support staff portal</p>
      {status === 'unconfigured' ? (
        <div className="notice" role="status">
          This build is not connected to a backend. Copy .env.example to .env.local, add your
          Supabase URL and publishable key, then restart.
        </div>
      ) : null}
      {notice ? (
        <div className="notice" role="alert">
          {notice}
        </div>
      ) : null}
      <form onSubmit={(e) => void onSubmit(e)} noValidate>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? 'email-err' : undefined}
          />
          {errors.email ? (
            <span id="email-err" className="field-error">
              {errors.email}
            </span>
          ) : null}
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? 'password-err' : undefined}
          />
          {errors.password ? (
            <span id="password-err" className="field-error">
              {errors.password}
            </span>
          ) : null}
        </div>
        {errors.form ? (
          <p role="alert" className="field-error">
            {errors.form}
          </p>
        ) : null}
        <button type="submit" className="btn" disabled={submitting || status === 'unconfigured'}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
