import { useEffect, useState, type SubmitEvent, type ReactNode } from 'react';
import { useAppDispatch, useAppSelector } from '../store';
import { authenticate, checkSession, loadCapabilities } from '../store/server';
import { messageFor } from '../core/model';
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
  const login = mode === 'login';
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await dispatch(authenticate(mode, { email, password })).unwrap();
    } catch (value) {
      setError(messageFor(value));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeading title={login ? 'Вход в FaultView' : 'Создать аккаунт'} />
      <form className="project-form" onSubmit={(event) => void submit(event)}>
        <div className="field">
          <label htmlFor="account-email">Email</label>
          <input
            id="account-email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="account-password">Пароль</label>
          <input
            id="account-password"
            type="password"
            autoComplete={login ? 'current-password' : 'new-password'}
            required
            minLength={12}
            maxLength={128}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {login ? null : <p className="muted">Минимум 12 символов.</p>}
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
