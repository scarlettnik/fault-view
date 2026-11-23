import { useEffect, useRef, useState, type SubmitEvent, type ReactNode } from 'react';
import { z } from 'zod';
import { useAppDispatch, useAppSelector } from '../store';
import { authenticate, checkSession, loadCapabilities } from '../store/server';
import { messageFor } from '../core/model';
import { accountCredentialsSchema, type AccountCredentials } from '../core/account';
import { Button } from './Button';
import { Busy, Notice, PageHeading } from './ui';

export function AccountGate({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();
  const { auth, user, authError } = useAppSelector((state) => state.server);
  useEffect(() => {
    void dispatch(checkSession());
    void dispatch(loadCapabilities());
  }, [dispatch]);
  if (user) return children;
  return (
    <main className="account-gate">
      <header className="account-brand">FAULTVIEW</header>
      {auth === 'ready' ? (
        <AccountForm />
      ) : auth === 'error' ? (
        <>
          <PageHeading title="Не удалось открыть рабочую область" />
          <Notice kind="error">{authError}</Notice>
          <Button onClick={() => void dispatch(checkSession())}>Повторить</Button>
        </>
      ) : (
        <Busy>Проверяем сессию…</Busy>
      )}
    </main>
  );
}

function AccountForm() {
  const dispatch = useAppDispatch();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Partial<Record<keyof AccountCredentials, string>>>({});
  const emailInput = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const login = mode === 'login';
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const parsed = accountCredentialsSchema.safeParse({ email, password });
    if (!parsed.success) {
      const { fieldErrors } = z.flattenError(parsed.error);
      setFields({ email: fieldErrors.email?.[0], password: fieldErrors.password?.[0] });
      (fieldErrors.email ? emailInput : passwordInput).current?.focus();
      return;
    }
    setFields({});
    setBusy(true);
    try {
      await dispatch(authenticate(mode, parsed.data)).unwrap();
    } catch (value) {
      setError(messageFor(value));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeading title={login ? 'Вход в FaultView' : 'Создать аккаунт'} />
      <form className="project-form" onSubmit={(event) => void submit(event)} noValidate>
        <div className="field">
          <label htmlFor="account-email">Email</label>
          <input
            id="account-email"
            ref={emailInput}
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            value={email}
            aria-invalid={!!fields.email}
            aria-describedby={fields.email ? 'account-email-error' : undefined}
            onChange={(event) => {
              setEmail(event.target.value);
              if (fields.email) setFields((current) => ({ ...current, email: undefined }));
            }}
          />
          {fields.email ? (
            <span id="account-email-error" className="field-error" role="alert">
              {fields.email}
            </span>
          ) : null}
        </div>
        <div className="field">
          <label htmlFor="account-password">Пароль</label>
          <input
            id="account-password"
            ref={passwordInput}
            type="password"
            autoComplete={login ? 'current-password' : 'new-password'}
            required
            minLength={12}
            maxLength={128}
            value={password}
            aria-invalid={!!fields.password}
            aria-describedby={
              fields.password
                ? 'account-password-error'
                : login
                  ? undefined
                  : 'account-password-hint'
            }
            onChange={(event) => {
              setPassword(event.target.value);
              if (fields.password) setFields((current) => ({ ...current, password: undefined }));
            }}
          />
          {fields.password ? (
            <span id="account-password-error" className="field-error" role="alert">
              {fields.password}
            </span>
          ) : login ? null : (
            <p id="account-password-hint" className="muted">
              Минимум 12 символов.
            </p>
          )}
        </div>
        {error ? <Notice kind="error">{error}</Notice> : null}
        <div className="row">
          <Button type="submit" busy={busy}>
            {login ? 'Войти' : 'Зарегистрироваться'}
          </Button>
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => {
              setMode(login ? 'register' : 'login');
              setPassword('');
              setFields({});
              setError('');
            }}
          >
            {login ? 'Создать аккаунт' : 'У меня есть аккаунт'}
          </button>
        </div>
      </form>
    </>
  );
}
