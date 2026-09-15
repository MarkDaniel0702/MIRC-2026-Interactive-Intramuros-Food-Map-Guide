import { MODES } from '../data/modes';
import type { ModeKey } from '../types';

/** Ported from index.html:37-42; #mastheadSub's text is driven by MODES[mode].subtitle
 *  (app.js:736, app.js:1175). */
export function Masthead({ mode }: { mode: ModeKey }) {
  return (
    <header className="masthead">
      <p className="masthead__eyebrow">Manila &middot; The Walled City</p>
      <h1 className="masthead__title">Intramuros</h1>
      <p className="masthead__sub">{MODES[mode].subtitle}</p>
      <div className="rule" aria-hidden="true"><span></span><span></span></div>
    </header>
  );
}
