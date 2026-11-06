import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { useAuth } from '../auth';
import { PreviewMan } from '../components/Stickman';
import { Swatches } from '../components/Swatches';
import type { Me, MyQuestion } from '../../../shared/types';

export default function Profile() {
  const { me, loading, setMe, refresh } = useAuth();
  const [questions, setQuestions] = useState<MyQuestion[]>([]);
  const [text, setText] = useState('');
  const [level, setLevel] = useState(1);
  const [raised, setRaised] = useState(false);
  const [msg, setMsg] = useState('');

  const loadQuestions = async () => setQuestions(await api<MyQuestion[]>('/api/my-questions'));
  useEffect(() => { if (me) loadQuestions().catch(() => {}); }, [me?.id]);
  useEffect(() => { refresh(); }, [refresh]);

  const run = async (fn: () => Promise<void>) => {
    setMsg('');
    try { await fn(); } catch (e) { setMsg(errorMessage(e)); }
  };

  if (loading) return null;
  if (!me) return <Navigate to="/" replace />;

  const pickColor = (color: string) => run(async () => setMe(await api<Me>('/api/me/color', 'POST', { color })));
  const addQuestion = () => run(async () => {
    setMe(await api<Me>('/api/questions', 'POST', { text, level }));
    setText('');
    await loadQuestions();
  });

  const chipClass = ['', '', 'chip-pink', 'chip-yellow'];

  return (
    <div className="p-5 flex justify-center">
      <main className="w-full max-w-md space-y-5">
        <header className="flex items-center justify-between pt-2">
          <h1 className="display logo text-3xl">My profile</h1>
          <Link to="/" className="link text-sm">Back to lobby</Link>
        </header>
        <p className="err">{msg}</p>

        <section className="panel">
          <div className="flex items-center gap-4">
            <PreviewMan color={me.color} raised={raised} onClick={() => setRaised(r => !r)}
              label="Tap to preview raising your hand" className="w-20 h-28 shrink-0 cursor-pointer" />
            <div className="flex-1">
              <h2 className="!mb-1">{me.username}</h2>
              <p className="text-sm muted">Tap your stickman to see how it looks with a raised hand.</p>
            </div>
          </div>
          <p className="text-sm muted mt-4 mb-2">Stickman color</p>
          <Swatches value={me.color} onPick={pickColor} />
        </section>

        <section className="grid grid-cols-2 gap-3">
          <div className="stat" style={{ borderColor: 'var(--pink)' }}>
            <span className="text-sm muted">Creator level</span>
            <b>{me.creatorLevel}</b>
            <span className="text-sm">{me.created} questions written</span>
            <span className="block text-xs muted mt-1">{me.nextCreatorAt ? `Next level at ${me.nextCreatorAt} questions` : 'Top level reached'}</span>
          </div>
          <div className="stat" style={{ borderColor: 'var(--lime)' }}>
            <span className="text-sm muted">Endorsement level</span>
            <b>{me.endorsementLevel}</b>
            <span className="text-sm">{me.likes} likes received</span>
            <span className="block text-xs muted mt-1">{me.nextEndorseAt ? `Next level at ${me.nextEndorseAt} likes` : 'Top level reached'}</span>
          </div>
        </section>

        <section className="panel space-y-3">
          <h2>Add your own question</h2>
          <textarea className="input" maxLength={200} rows={3} value={text} onChange={e => setText(e.target.value)}
            placeholder="Write a question for the deck (10 to 200 characters)" />
          <div className="flex gap-2 items-center">
            <select className="input !w-auto" value={level} onChange={e => setLevel(Number(e.target.value))}>
              <option value={1}>Level 1</option><option value={2}>Level 2</option><option value={3}>Level 3</option>
            </select>
            <span className="text-sm muted flex-1 text-right">{text.length} / 200</span>
          </div>
          <button className="btn btn-pink" onClick={addQuestion}>Add question</button>
        </section>

        <section className="panel">
          <h2>My questions</h2>
          <ul className="space-y-2">
            {questions.map(q => (
              <li key={q.id} className="flex gap-3 items-start">
                <span className={'chip ' + chipClass[q.level]}>L{q.level}</span>
                <span className="flex-1 text-sm">{q.text}</span>
                <span className="text-sm muted">{q.likes} {q.likes === 1 ? 'like' : 'likes'}</span>
              </li>
            ))}
          </ul>
          {questions.length === 0 && (
            <p className="muted text-sm">You haven't written any yet. Add one above and it can show up in rooms that use community questions.</p>
          )}
        </section>
      </main>
    </div>
  );
}
