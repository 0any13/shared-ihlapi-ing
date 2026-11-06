import { useState } from 'react';
import { Link } from 'react-router-dom';

const TRIVIA = [
  'Yaghan (also called Yámana) is a language isolate from Tierra del Fuego, at the southern tip of South America.',
  'The word is also written "mamihlapinatapei" in some sources; the spelling varies.',
  'Yaghan words can pack a whole sentence into one word, which is part of why this one is so hard to translate.',
  'Cristina Calderón, widely described as the last native speaker of Yaghan, died in 2022.',
];

export function Finish() {
  const [fact, setFact] = useState(TRIVIA[0]);
  const [open, setOpen] = useState(false); // phones have no hover, so tapping toggles it
  const randomFact = () => setFact(TRIVIA[Math.floor(Math.random() * TRIVIA.length)]);

  return (
    <div className="finish">
      <div className="panel finish-box text-center space-y-4">
        <h2 className="display logo text-4xl !mb-0">Yay!</h2>
        <p className="text-lg">
          Congrats on finishing this session !! You can now enjoy succumbing into{' '}
          <span
            className={'mami' + (open ? ' open' : '')} tabIndex={0} role="button"
            onMouseEnter={randomFact} onFocus={randomFact}
            onClick={() => { randomFact(); setOpen(o => !o); }}
          >
            mamihlapinatapai
            <span className="tip" role="tooltip">
              <b>mamihlapinatapai</b> is a Yaghan word from Tierra del Fuego for a look shared by two people, each wishing the other would start something they both want, but neither wants to begin.
              <br /><br />
              <b>mam-</b> reflexive/reciprocal ("each other") · <b>ihlapi</b> "to be at a loss about what to do next" · <b>-n</b> a stative ending · <b>-atapai</b> dual ("the two of them"). Sources break it down slightly differently.
              <br /><br />
              It is listed in the Guinness Book of World Records as one of the most succinct and hardest-to-translate words.
              <br /><br />
              <i>{fact}</i>
            </span>
          </span>.
        </p>
        <Link to="/" className="btn btn-cyan">Back to lobby</Link>
      </div>
    </div>
  );
}
