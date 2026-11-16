import { useState, type FormEvent } from 'react';
import { LuInfo } from 'react-icons/lu';
import type { User } from '../../core/types';
import { useT } from '../i18n';
import { api } from '../lib/api';
import { errorMessage } from '../lib/hooks';
import { Link, useRouter } from '../lib/router';
import { useSession } from '../lib/session';
import { StageTrack } from '../ui/StageTrack';
import { Logo } from '../ui/bits';
import { Button, Field, Input, Notice } from '../ui/kit';

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const t = useT();
  const { setUser, meta } = useSession();
  const { navigate } = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isRegister = mode === 'register';

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { user } = await api.post<{ user: User }>(isRegister ? '/api/auth/register' : '/api/auth/login', isRegister ? { name, email, password } : { email, password });
      setUser(user);
      navigate('/', { replace: true });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-full lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <section className="flex flex-col justify-between gap-10 border-b border-line bg-surface px-6 py-8 sm:px-12 lg:border-r lg:border-b-0 lg:py-12">
        <Logo />
        <div className="max-w-xl">
          <h1 className="text-[clamp(1.75rem,3.4vw,2.6rem)] leading-[1.12] font-semibold tracking-[-0.02em]">{t.brand.tagline}</h1>
          <p className="mt-4 max-w-md text-[15px] text-muted">{t.auth.pitch}</p>
        </div>
        <div className="max-w-xl">
          <StageTrack stage="blueprint" />
          <p className="mt-5 text-[13px] text-muted">{t.auth.today}</p>
        </div>
      </section>

      <section className="flex items-center justify-center px-6 py-10 sm:px-12">
        <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-4" noValidate>
          <h2 className="text-xl font-semibold tracking-[-0.01em]">{isRegister ? t.auth.registerTitle : t.auth.loginTitle}</h2>
          {meta?.mode === 'demo' && (
            <Notice icon={<LuInfo />}>{t.auth.demoNote}</Notice>
          )}
          {isRegister && (
            <Field label={t.auth.name} htmlFor="auth-name">
              <Input id="auth-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required autoFocus />
            </Field>
          )}
          <Field label={t.auth.email} htmlFor="auth-email">
            <Input id="auth-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required autoFocus={!isRegister} />
          </Field>
          <Field label={t.auth.password} htmlFor="auth-password" hint={isRegister ? t.auth.passwordHint : undefined}>
            <Input id="auth-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={isRegister ? 'new-password' : 'current-password'} required />
          </Field>
          {error && (
            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger-ink">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" size="lg" loading={busy}>
            {isRegister ? t.auth.register : t.auth.login}
          </Button>
          <p className="text-center text-[13px] text-muted">
            {isRegister ? t.auth.toLogin : t.auth.toRegister}{' '}
            <Link to={isRegister ? '/ingresar' : '/registro'} className="font-medium text-brand-ink hover:underline">
              {isRegister ? t.auth.toLoginLink : t.auth.toRegisterLink}
            </Link>
          </p>
        </form>
      </section>
    </div>
  );
}
