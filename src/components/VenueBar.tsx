import { ALL_LANDMARKS } from '../data/destinations';

/** Same glyph the See tab and the "Show on map" chips use for a building. */
const BUILDING_ICON = 'M2 13.5h12M3.4 13.5V7M6.5 13.5V7M9.5 13.5V7M12.6 13.5V7M2 6.4 8 2.6l6 3.8z';

const CAMPUS = ALL_LANDMARKS.find(lm => !lm.campus);
const BUILDINGS = ALL_LANDMARKS.filter(lm => lm.campus);

/**
 * The MIRC 2026 venue, one tap away from every tab. The campus buildings are
 * drawn only once the map is zoomed past CAMPUS_MIN_ZOOM and sit in no list and
 * no search index, so without this a first-time visitor has no way to find
 * "GEE" short of knowing to tap the PLM marker and zoom. Each chip does exactly
 * what tapping the marker does -- fly in and open the popup, which names the
 * building's rooms and carries its Get directions button (mapApi.focusById).
 * The codes are the ones the programme prints (GEE KL, GK BTB …), so they are
 * what a delegate is holding when they look up.
 */
export function VenueBar({ onPick }: { onPick: (id: string) => void }) {
  return (
    <fieldset className="filter" id="venueBar">
      <legend className="filter__legend">MIRC 2026 venue</legend>
      <div className="chips">
        {CAMPUS && (
          <button type="button" className="chip chip--venue" title={CAMPUS.name} aria-label={CAMPUS.name}
            onClick={() => onPick(CAMPUS.id)}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d={BUILDING_ICON} /></svg>
            {CAMPUS.short} campus
          </button>
        )}
        {BUILDINGS.map(b => (
          <button key={b.id} type="button" className="chip chip--venue" title={b.name} aria-label={b.name}
            onClick={() => onPick(b.id)}>
            <span className="chip__code">{b.short}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}
