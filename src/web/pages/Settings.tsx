import { useEffect, useState, type FormEvent } from 'react';
import { LuInfo, LuKeyRound, LuLogOut, LuShieldCheck, LuTrash2 } from 'react-icons/lu';
import type { ProviderView, User } from '../../core/types';
import { useT } from '../i18n';
import { api } from '../lib/api';
import { formatNumber, timeAgo } from '../lib/format';
import { errorMessage, useAsync } from '../lib/hooks';
import { useRouter } from '../lib/router';
import { useSession } from '../lib/session';
import { Badge, Button, Card, ErrorBlock, Field, Input, LoadingBlock, Notice, PageHeader, Segmented, Select, Tabs, type Tone } from '../ui/kit';
import { ConfirmDialog, useToast } from '../ui/overlay';

type Tab = 'perfil' | 'apariencia' | 'proveedores' | 'cuenta';
const TABS: Tab[] = ['perfil', 'apariencia', 'proveedores', 'cuenta'];

// ---------- Perfil y apariencia ----------

function Profile({ user }: { user: User }) {
  const t = useT();
  const s = t.settings.profile;
  const { setUser } = useSession();
  const toast = useToast();
  const [name, setName] = useState(user.name);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const { user: updated } = await api.patch<{ user: User }>('/api/auth/me', { name });
      setUser(updated);
      toast.ok(s.saved);
    } catch (cause) {
      toast.error(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="max-w-xl p-5">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label={s.name} htmlFor="profile-name">
          <Input id="profile-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required />
        </Field>
        <Field label={s.email} htmlFor="profile-email" hint={s.emailHint}>
          <Input id="profile-email" value={user.email} disabled readOnly />
        </Field>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] text-muted">
            {s.role}: {s.roles[user.role]}
          </span>
          <Button type="submit" variant="primary" loading={busy} disabled={name.trim().length < 2 || name.trim() === user.name}>
            {t.common.save}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function Appearance({ user }: { user: User }) {
  const t = useT();
  const s = t.settings.appearance;
  const { setUser } = useSession();
  const toast = useToast();

  const setTheme = async (theme: User['theme']) => {
    const previous = user;
    setUser({ ...user, theme });
    try {
      await api.patch('/api/auth/me', { theme });
    } catch (cause) {
      setUser(previous);
      toast.error(errorMessage(cause));
    }
  };

  return (
    <Card className="flex max-w-xl flex-col gap-5 p-5">
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium">{s.theme}</span>
        <div>
          <Segmented
            label={s.theme}
            value={user.theme}
            onChange={(theme) => void setTheme(theme)}
            options={[
              { value: 'claro', label: s.light },
              { value: 'oscuro', label: s.dark },
            ]}
          />
        </div>
      </div>
      <Field label={s.language} htmlFor="settings-language" hint={s.languageHint}>
        <Select id="settings-language" value={user.locale} onChange={() => {}} className="max-w-56">
          <option value="es">{s.spanish}</option>
        </Select>
      </Field>
    </Card>
  );
}

// ---------- Proveedores de IA ----------

function ProviderCard({ provider, canConnect, onProviders }: { provider: ProviderView; canConnect: boolean; onProviders(providers: ProviderView[]): void }) {
  const t = useT();
  const s = t.settings.providers;
  const toast = useToast();
  const [apiKey, setApiKey] = useState('');
  const [editingKey, setEditingKey] = useState(false);
  const [busy, setBusy] = useState<'connect' | 'verify' | 'update' | 'disconnect' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const fieldId = `provider-key-${provider.id}`;

  const call = async (kind: NonNullable<typeof busy>, request: () => Promise<{ providers: ProviderView[] }>, done: (providers: ProviderView[]) => void) => {
    setBusy(kind);
    setError(null);
    try {
      const { providers } = await request();
      onProviders(providers);
      done(providers);
    } catch (cause) {
      if (kind === 'connect') setError(errorMessage(cause));
      else toast.error(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  const connect = (event: FormEvent) => {
    event.preventDefault();
    void call(
      'connect',
      () => api.put(`/api/providers/${provider.id}`, { apiKey }),
      () => {
        setApiKey('');
        setEditingKey(false);
        toast.ok(s.connectedToast(provider.label));
      },
    );
  };
  const verify = () =>
    call(
      'verify',
      () => api.post(`/api/providers/${provider.id}/verify`),
      (providers) => {
        const updated = providers.find((p) => p.id === provider.id);
        if (updated?.status === 'conectado') toast.ok(s.verifiedToast);
        else toast.error(updated?.lastError ?? s.verifyFailed);
      },
    );
  const update = (patch: { model?: string; primary?: boolean }) => call('update', () => api.patch(`/api/providers/${provider.id}`, patch), () => toast.ok(patch.model ? s.modelSaved : s.primarySaved));
  const disconnect = () =>
    call(
      'disconnect',
      () => api.del(`/api/providers/${provider.id}`),
      () => {
        setConfirm(false);
        toast.ok(s.disconnectedToast(provider.label));
      },
    );

  const pending = provider.availability === 'pendiente';
  const builtin = provider.availability === 'integrado';
  const state: { tone: Tone; label: string } = pending
    ? { tone: 'neutral', label: s.pending }
    : builtin
      ? { tone: 'teal', label: s.builtinTag }
      : !provider.connected
        ? { tone: 'neutral', label: s.notConnected }
        : provider.status === 'conectado'
          ? { tone: 'ok', label: s.connected }
          : { tone: 'danger', label: s.error };
  const showForm = !pending && !builtin && canConnect && (!provider.connected || editingKey);
  const usage = provider.usage.calls === 0 ? s.usageNone : builtin ? s.usageBuiltin(provider.usage.calls) : s.usage(provider.usage.calls, formatNumber(provider.usage.inputTokens), formatNumber(provider.usage.outputTokens));

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h3 className="text-base font-semibold">{provider.label}</h3>
          <Badge tone={state.tone} dot={!pending}>
            {state.label}
          </Badge>
          {provider.primary && provider.connected && <Badge tone="brand">{s.primary}</Badge>}
        </div>
        {provider.connected && !builtin && (
          <div className="flex flex-wrap gap-2">
            {!provider.primary && provider.status === 'conectado' && (
              <Button size="sm" onClick={() => void update({ primary: true })} disabled={busy !== null}>
                {s.makePrimary}
              </Button>
            )}
            <Button size="sm" onClick={() => void verify()} loading={busy === 'verify'} disabled={busy !== null}>
              {s.verify}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirm(true)} disabled={busy !== null}>
              {s.disconnect}
            </Button>
          </div>
        )}
      </div>

      {pending && <p className="mt-2 text-[13.5px] text-muted">{s.geminiText}</p>}
      {builtin && <p className="mt-2 text-[13.5px] text-muted">{s.builtin}</p>}
      {(builtin || provider.connected) && <p className="mt-2 text-[13px] text-muted">{usage}</p>}

      {provider.connected && !builtin && (
        <div className="mt-4 grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
          <Field label={s.model} htmlFor={`provider-model-${provider.id}`}>
            <Select id={`provider-model-${provider.id}`} value={provider.model ?? ''} disabled={busy !== null || provider.models.length === 0} onChange={(event) => void update({ model: event.target.value })}>
              {provider.models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex flex-col justify-end gap-1 text-[13px] text-muted">
            <span className="flex items-center gap-1.5">
              <LuKeyRound className="size-3.5" />
              {s.key(provider.keyHint ?? '')}
              {!editingKey && canConnect && (
                <button type="button" onClick={() => setEditingKey(true)} className="ml-1 font-medium text-brand-ink hover:underline">
                  {s.replaceKey}
                </button>
              )}
            </span>
            {provider.lastVerifiedAt && <span>{s.verifiedAt(timeAgo(provider.lastVerifiedAt))}</span>}
          </div>
          {provider.lastError && (
            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger-ink sm:col-span-2">
              {provider.lastError}
            </p>
          )}
        </div>
      )}

      {showForm && (
        <form onSubmit={connect} className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
          <Field label={s.apiKey} htmlFor={fieldId} error={error}>
            <div className="flex flex-wrap gap-2">
              <Input id={fieldId} type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={s.apiKeyPh} autoComplete="off" spellCheck={false} className="min-w-56 flex-1 font-mono" />
              <Button type="submit" variant="primary" loading={busy === 'connect'} disabled={apiKey.trim().length < 8}>
                {busy === 'connect' ? s.connecting : s.connect}
              </Button>
              {editingKey && (
                <Button onClick={() => setEditingKey(false)} disabled={busy !== null}>
                  {t.common.cancel}
                </Button>
              )}
            </div>
          </Field>
        </form>
      )}

      <ConfirmDialog open={confirm} title={s.disconnectTitle(provider.label)} text={s.disconnectText} confirmLabel={s.disconnect} danger busy={busy === 'disconnect'} onConfirm={() => void disconnect()} onClose={() => setConfirm(false)} />
    </Card>
  );
}

function Providers() {
  const t = useT();
  const s = t.settings.providers;
  const { meta, refreshAi } = useSession();
  const list = useAsync(() => api.get<{ providers: ProviderView[] }>('/api/providers'), []);
  const canConnect = meta?.secureSecrets ?? false;

  if (list.loading && !list.data) return <LoadingBlock />;
  if (list.error || !list.data) return <ErrorBlock message={list.error ?? ''} onRetry={list.reload} />;
  const setProviders = (providers: ProviderView[]) => {
    list.setData({ providers });
    void refreshAi();
  };
  const hasBuiltin = list.data.providers.some((p) => p.availability === 'integrado');

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Notice tone="neutral" icon={<LuShieldCheck />}>
        <p>{s.intro}</p>
        <p className="mt-1">{s.subscriptionNote}</p>
      </Notice>
      {!canConnect && (
        <Notice tone="brand" icon={<LuInfo />}>
          {s.demo} {!hasBuiltin && s.builtinWaiting}
        </Notice>
      )}
      {list.data.providers.map((provider) => (
        <ProviderCard key={provider.id} provider={provider} canConnect={canConnect} onProviders={setProviders} />
      ))}
      <p className="text-[13px] text-muted">{s.later}</p>
    </div>
  );
}

// ---------- Cuenta ----------

function Account({ onReset }: { onReset?: () => void }) {
  const t = useT();
  const s = t.settings.account;
  const { logout, meta } = useSession();
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="flex max-w-xl flex-col gap-4">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <p className="font-medium">{s.logout}</p>
          <p className="text-[13px] text-muted">{s.logoutText}</p>
        </div>
        <Button icon={<LuLogOut className="size-4" />} onClick={() => void logout()}>
          {s.logout}
        </Button>
      </Card>
      {onReset && (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div className="min-w-0 flex-1 basis-64">
            <p className="font-medium">{s.reset}</p>
            <p className="text-[13px] text-muted">{s.resetText}</p>
          </div>
          <Button icon={<LuTrash2 className="size-4" />} onClick={() => setConfirm(true)}>
            {s.reset}
          </Button>
        </Card>
      )}
      {meta && <p className="text-[13px] text-muted">{s.version(meta.version)}</p>}
      <ConfirmDialog open={confirm} title={s.resetTitle} text={s.resetConfirm} confirmLabel={s.reset} danger onConfirm={() => onReset?.()} onClose={() => setConfirm(false)} />
    </div>
  );
}

// ---------- Página ----------

export function SettingsPage({ tab: routeTab, onResetDemo }: { tab?: string; onResetDemo?: () => void }) {
  const t = useT();
  const { user } = useSession();
  const { navigate } = useRouter();
  const tab: Tab = TABS.includes(routeTab as Tab) ? (routeTab as Tab) : 'perfil';
  useEffect(() => {
    if (routeTab && !TABS.includes(routeTab as Tab)) navigate('/configuracion', { replace: true });
  }, [routeTab, navigate]);
  if (!user) return null;

  const labels: Record<Tab, string> = { perfil: t.settings.tabs.profile, apariencia: t.settings.tabs.appearance, proveedores: t.settings.tabs.providers, cuenta: t.settings.tabs.account };
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t.settings.title} />
      <Tabs value={tab} onChange={(next) => navigate(next === 'perfil' ? '/configuracion' : `/configuracion/${next}`)} tabs={TABS.map((value) => ({ value, label: labels[value] }))} />
      {tab === 'perfil' && <Profile user={user} />}
      {tab === 'apariencia' && <Appearance user={user} />}
      {tab === 'proveedores' && <Providers />}
      {tab === 'cuenta' && <Account onReset={onResetDemo} />}
    </div>
  );
}
