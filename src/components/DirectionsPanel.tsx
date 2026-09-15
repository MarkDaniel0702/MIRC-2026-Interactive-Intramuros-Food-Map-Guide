import { START_POINTS } from '../../data/start-points.js';
import { findAnywhere } from '../data/modes';
import { ARROWS } from '../lib/icons';
import { fmtDistance, fmtMins } from '../lib/format';
import type { MapApi } from '../hooks/useLeafletMap';
import type { FullDirsState } from '../state/store';

function ArrowSvg({ arrow }: { arrow: string }) {
  return <svg className="dirs__arrow" viewBox="0 0 16 16" aria-hidden="true"><path d={ARROWS[arrow] || ARROWS.straight} /></svg>;
}

/**
 * Ported from index.html:114-150 (markup), app.js:810-817 (buildPresets),
 * app.js:863-867 (setDirsMessage) and app.js:894-922 (renderRoute's text half --
 * the map-drawing half lives in useLeafletMap's effect on state.dirs.result).
 */
export function DirectionsPanel({ dirs, mapApi }: { dirs: FullDirsState; mapApi: MapApi }) {
  const dest = dirs.destId ? findAnywhere(dirs.destId) : null;

  return (
    <section className="dirs" hidden={!dirs.open} aria-label="Walking directions">
      <button type="button" className="dirs__back" onClick={mapApi.closeDirections}>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9.6 3.2 4.8 8l4.8 4.8" /></svg>
        Back to the list
      </button>

      <p className="dirs__to-label">Walking to</p>
      <h2 className="dirs__to">{dest?.spot.name ?? ''}</h2>

      <div className="dirs__from">
        <p className="dirs__from-label">Start from</p>
        <div className="dirs__opts">
          <button type="button" className="dirs__opt" onClick={mapApi.useMyLocationForDirections}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="2.4" /><circle cx="8" cy="8" r="5.6" /><path d="M8 .8v1.8M8 13.4v1.8M.8 8h1.8M13.4 8h1.8" /></svg>
            My location
          </button>
          <button type="button" className={`dirs__opt${dirs.picking ? ' is-on' : ''}`} onClick={mapApi.togglePicking}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 14.5S13 10 13 6.4a5 5 0 0 0-10 0C3 10 8 14.5 8 14.5z" /><circle cx="8" cy="6.3" r="1.7" /></svg>
            Tap a point on the map
          </button>
        </div>
        <p className="dirs__preset-label">Or arriving at&hellip;</p>
        <div className="chips">
          {START_POINTS.map(p => (
            <button key={p.id} type="button" className={`chip chip--preset${dirs.start?.id === p.id ? ' is-on' : ''}`}
              title={p.note}
              onClick={() => mapApi.setStart({ lat: p.lat, lng: p.lng, name: p.name, id: p.id })}>
              {p.name}{p.outside && <span className="chip__out">outside</span>}
            </button>
          ))}
        </div>
      </div>

      <p className={`dirs__msg${dirs.message?.kind ? ` dirs__msg--${dirs.message.kind}` : ''}`} role="status" hidden={!dirs.message}>
        {dirs.message?.text ?? ''}
      </p>

      <div className="dirs__result" hidden={!dirs.result}>
        {dirs.result && dirs.start && (
          <>
            <div className="dirs__summary">
              <span className="dirs__dist">{fmtDistance(dirs.result.distance)}</span>
              <span className="dirs__time">{fmtMins(dirs.result.duration)}</span>
            </div>
            <p className="dirs__from-name">From {dirs.start.name}</p>
            <ol className="dirs__steps">
              {dirs.result.steps.map((s, i) => (
                <li key={i} className={`dirs__step${s.last ? ' dirs__step--last' : ''}`}>
                  <span className="dirs__n">{i + 1}</span>
                  <ArrowSvg arrow={s.arrow} />
                  <span className="dirs__text">
                    {s.text}
                    {s.distance > 5 && !s.last && <span className="dirs__len">{fmtDistance(s.distance)}</span>}
                  </span>
                </li>
              ))}
            </ol>
            <p className="dirs__credit">
              {dirs.result.fallback
                ? <>Straight-line estimate at 80 m/min.{dirs.result.externalUrl && <> <a href={dirs.result.externalUrl} target="_blank" rel="noopener">Open in OpenStreetMap</a></>}</>
                : 'Walking route by the FOSSGIS OSRM service, using OpenStreetMap data.'}
            </p>
          </>
        )}
      </div>
    </section>
  );
}
