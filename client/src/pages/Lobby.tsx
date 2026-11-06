import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { useAuth } from '../auth';
import { PALETTE } from '../palette';
import { PreviewMan } from '../components/Stickman';
import { Swatches } from '../components/Swatches';

function AuthForm() {
  const { refresh } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [color, setColor] = useState(PALETTE[0]);
  const [msg, setMsg] = useState('');
  const reg = mode === 'register';

  const submit = async () => {
    setMsg('');
    try {
      await api(reg ? '/api/register' : '/api/login', 'POST', reg ? { username, password, color } : { username, password });
      await refresh();
    } catch (e) { setMsg(errorMessage(e)); }
  };

  return (
    <>
      <p className="err">{msg}</p>
      <section className="panel space-y-3">
        <input className="input" placeholder="Username" autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} />
        <input className="input" type="password" placeholder="Password (min 6)" autoComplete="current-password"
          value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} />
        {reg && (
          <div>
            <p className="text-sm muted mb-2">Pick your stickman color (you can change it later)</p>
            <Swatches value={color} onPick={setColor} />
          </div>
        )}
        <button className={'btn w-full ' + (reg ? 'btn-pink' : 'btn-cyan')} onClick={submit}>{reg ? 'Create account' : 'Log in'}</button>
        <p className="text-sm muted text-center">
          {reg ? 'Already have an account?' : 'New here?'}{' '}
          <button type="button" className="link" onClick={() => { setMode(reg ? 'login' : 'register'); setMsg(''); }}>
            {reg ? 'Log in' : 'Create an account'}
          </button>
        </p>
      </section>
    </>
  );
}

function LobbyApp() {
  const { me, setMe, refresh } = useAuth();
  useEffect(() => { refresh(); }, [refresh]);
  const navigate = useNavigate();
  const [mode, setMode] = useState<'original' | 'mixed'>('original');
  const [discord, setDiscord] = useState('');
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');

  const run = async (fn: () => Promise<void>) => {
    setMsg('');
    try { await fn(); } catch (e) { setMsg(errorMessage(e)); }
  };

  const create = () => run(async () => {
    const r = await api<{ code: string }>('/api/rooms', 'POST', { mode, discordLink: discord.trim() });
    navigate('/room?code=' + r.code);
  });
  const join = () => run(async () => {
    const c = code.trim().toUpperCase();
    await api('/api/rooms/' + c); // checks that it exists
    navigate('/room?code=' + c);
  });
  const logout = () => run(async () => { await api('/api/logout', 'POST'); setMe(null); });

  if (!me) return null;
  return (
    <div className="space-y-5">
      <p className="err">{msg}</p>
      <section className="panel flex items-center gap-4">
        <PreviewMan color={me.color} className="w-16 h-24 shrink-0" />
        <div className="flex-1">
          <h2 className="!mb-1">Hi, {me.username}</h2>
          <p className="text-sm">
            <span className="chip chip-pink">Creator: {me.creatorLevel}</span>{' '}
            <span className="chip chip-lime">Endorsement: {me.endorsementLevel}</span>
          </p>
          <p className="text-sm mt-2"><Link to="/profile" className="link">Profile and my questions</Link></p>
        </div>
        <button className="btn btn-ghost !px-3 !py-2 text-sm" onClick={logout}>Log out</button>
      </section>

      <section className="panel space-y-3">
        <h2>Start a room</h2>
        <select className="input" value={mode} onChange={e => setMode(e.target.value as 'original' | 'mixed')}>
          <option value="original">Original questions only</option>
          <option value="mixed">Original and community questions</option>
        </select>
        <input className="input" placeholder="Discord invite link for voice (optional)" value={discord} onChange={e => setDiscord(e.target.value)} />
        <button className="btn btn-lime" onClick={create}>Create room</button>
      </section>

      <section className="panel space-y-3">
        <h2>Join a room</h2>
        <input className="input uppercase" placeholder="Room code" value={code} onChange={e => setCode(e.target.value)} />
        <button className="btn btn-yellow" onClick={join}>Join room</button>
      </section>
    </div>
  );
}

export default function Lobby() {
  const { me, loading } = useAuth();
  return (
    <div className="p-5 flex justify-center">
      <main className="w-full max-w-md space-y-5">
        <header className="pt-4 space-y-1">
          <h1 className="display logo text-5xl">Shared Ihlapi-ing</h1>
          <p className="muted">A card game for people who are (not) really strangers.</p>
        </header>
        {!loading && (me ? <LobbyApp /> : <AuthForm />)}
      </main>
    </div>
  );
}
