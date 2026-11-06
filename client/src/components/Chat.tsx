import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '../../../shared/types';

export function Chat({ messages, onSend }: { messages: ChatMessage[]; onSend: (t: string) => void }) {
  const [text, setText] = useState('');
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight }); }, [messages]);

  const send = () => { if (text.trim()) onSend(text); setText(''); };

  return (
    <section className="panel">
      <div ref={box} className="chat-box">
        {messages.map((m, i) => (
          <p key={i}><b style={m.color ? { color: m.color } : undefined}>{m.username}: </b>{m.text}</p>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          className="input flex-1" maxLength={300} placeholder="Say something..."
          value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()}
        />
        <button className="btn btn-cyan" onClick={send}>Send</button>
      </div>
    </section>
  );
}
