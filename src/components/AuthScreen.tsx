import { useState } from 'react';
import type { FormEvent } from 'react';
import { BookOpenCheck, Calculator, Eye, EyeOff, HardHat, LockKeyhole, Mail } from 'lucide-react';
import { db } from '../lib/supabase';
import { getErrorMessage } from '../lib/format';
import { BusyIcon, FIELD, PRIMARY_BUTTON } from './UI';

export default function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');
    if (!email.includes('@')) { setError('Введите корректную электронную почту.'); return; }
    if (password.length < 6) { setError('Пароль должен содержать минимум 6 символов.'); return; }
    setLoading(true);
    try {
      if (mode === 'register') {
        const { data, error: authError } = await db().auth.signUp({ email: email.trim(), password });
        if (authError) throw authError;
        if (!data.session) setMessage('Аккаунт создан. Если вход не выполнен автоматически, отключите подтверждение почты в Supabase или подтвердите адрес.');
      } else {
        const { error: authError } = await db().auth.signInWithPassword({ email: email.trim(), password });
        if (authError) throw authError;
      }
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-backdrop min-h-screen px-4 py-8 sm:px-6 sm:py-14">
      <div className="mx-auto grid max-w-6xl items-center gap-10 lg:min-h-[80vh] lg:grid-cols-[1.15fr_0.85fr] lg:gap-20">
        <section className="hidden lg:block">
          <div className="mb-7 flex items-center gap-3 text-brand-800"><div className="rounded-2xl bg-white/90 p-3 shadow-card"><HardHat size={32} /></div><span className="text-xl font-black tracking-tight">СМЕТА</span></div>
          <h1 className="max-w-xl text-5xl font-black leading-[1.12] tracking-tight text-ink">Строительные сметы — проще, чем таблица.</h1>
          <p className="mt-6 max-w-lg text-lg leading-8 text-slate-600">Ваш справочник расценок, план работ и учёт выполненного. Всё в одном месте, с телефона или компьютера.</p>
          <div className="mt-10 grid max-w-lg gap-4">
            <div className="flex items-center gap-3 rounded-2xl border border-white bg-white/70 p-4"><BookOpenCheck className="text-brand-700" size={24} /><span className="font-medium text-slate-700">Свои расценки всегда под рукой</span></div>
            <div className="flex items-center gap-3 rounded-2xl border border-white bg-white/70 p-4"><Calculator className="text-brand-700" size={24} /><span className="font-medium text-slate-700">Суммы пересчитываются автоматически</span></div>
          </div>
        </section>
        <section className="mx-auto w-full max-w-md rounded-[28px] border border-white/90 bg-white p-6 shadow-[0_24px_90px_-42px_rgba(29,50,62,0.48)] sm:p-9">
          <div className="mb-6 flex items-center gap-3 lg:hidden"><div className="rounded-xl bg-brand-50 p-2.5 text-brand-700"><HardHat size={26} /></div><span className="text-xl font-black text-ink">СМЕТА</span></div>
          <h2 className="text-2xl font-extrabold tracking-tight text-ink">{mode === 'login' ? 'Вход в аккаунт' : 'Создать аккаунт'}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">{mode === 'login' ? 'Войдите, чтобы продолжить работу со своими сметами.' : 'Зарегистрируйтесь, чтобы сохранять расценки и сметы.'}</p>
          <div className="mt-6 flex rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Способ входа">
            <button role="tab" aria-selected={mode === 'login'} onClick={() => { setMode('login'); setError(''); setMessage(''); }} className={`w-1/2 rounded-lg py-2.5 text-sm font-bold ${mode === 'login' ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500'}`}>Войти</button>
            <button role="tab" aria-selected={mode === 'register'} onClick={() => { setMode('register'); setError(''); setMessage(''); }} className={`w-1/2 rounded-lg py-2.5 text-sm font-bold ${mode === 'register' ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500'}`}>Регистрация</button>
          </div>
          <form className="mt-6 space-y-4" onSubmit={onSubmit}>
            <label className="block"><span className="mb-1.5 block text-sm font-semibold text-slate-700">Электронная почта</span><div className="relative"><Mail size={18} className="pointer-events-none absolute left-3.5 top-3.5 text-slate-400" /><input className={`${FIELD} pl-11`} type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required placeholder="name@example.ru" /></div></label>
            <label className="block"><span className="mb-1.5 block text-sm font-semibold text-slate-700">Пароль</span><div className="relative"><LockKeyhole size={18} className="pointer-events-none absolute left-3.5 top-3.5 text-slate-400" /><input className={`${FIELD} pl-11 pr-11`} type={visible ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} minLength={6} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required placeholder="Минимум 6 символов" /><button type="button" aria-label={visible ? 'Скрыть пароль' : 'Показать пароль'} onClick={() => setVisible(!visible)} className="absolute right-2 top-2 rounded-lg p-2 text-slate-400 hover:bg-slate-100">{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
            {error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2.5 text-sm leading-6 text-rose-700">{error}</p>}
            {message && <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2.5 text-sm leading-6 text-emerald-700">{message}</p>}
            <button type="submit" disabled={loading} className={`${PRIMARY_BUTTON} !w-full !py-3.5 !text-base`}>{loading && <BusyIcon />}{mode === 'login' ? 'Войти' : 'Зарегистрироваться'}</button>
          </form>
          <p className="mt-6 text-center text-xs leading-5 text-slate-400">Данные защищены отдельным доступом для каждого пользователя.</p>
        </section>
      </div>
    </main>
  );
}
