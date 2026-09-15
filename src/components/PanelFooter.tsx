import { Fragment } from 'react';
import { MODES } from '../data/modes';
import { INTRAMUROS_PASSPORT } from '../../data/tourist-spots.js';
import type { ModeKey } from '../types';

/** Ported from app.js:705-722 buildLegend (the footer half; #dialogLegend is
 *  AboutDialog's concern, since it always shows the food price scale regardless
 *  of the active tab) and index.html:152-165. */
export function PanelFooter({ mode }: { mode: ModeKey }) {
  const m = MODES[mode];
  return (
    <footer className="panel__foot">
      <p className="legend__title">{m.legendTitle} <span>{m.legendNote}</span></p>
      <dl className="legend">
        {Object.values(m.tiers).map(t => (
          <Fragment key={t.symbol}>
            <dt>{t.symbol}</dt>
            <dd>{t.label} <span>&mdash; {t.range}</span></dd>
          </Fragment>
        ))}
      </dl>

      {mode === 'sights' && (
        <div className="passport">
          <p className="passport__head">Intramuros Passport &mdash; <b>{INTRAMUROS_PASSPORT.price}</b></p>
          <p className="passport__text">
            Covers {INTRAMUROS_PASSPORT.covers.join(', ')}. {INTRAMUROS_PASSPORT.extra} Worth it from three paid sites onward.
          </p>
        </div>
      )}

      <p className="credit">
        Boundary &amp; places from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>,
        ODbL. Reviewed <span>{m.reviewed}</span>.
      </p>
    </footer>
  );
}
