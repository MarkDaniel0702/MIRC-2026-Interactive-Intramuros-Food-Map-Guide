/**
 * MIRC 2026 assistant -- the chat panel on the map. Ported from chat.js, which
 * was already fully self-contained (no dependency on app.js/Leaflet), so this
 * ports over with no architectural change, just DOM -> JSX and imperative state
 * -> useState/refs.
 *
 * Two things change from the original on purpose:
 *  - ENDPOINT becomes a dev-vs-prod split: the Vite dev server proxies /chat to
 *    the Worker (vite.config.ts) because worker/wrangler.toml's ALLOWED_ORIGINS
 *    does not include the Vite dev origin -- see plan contract #2.
 *  - CORPUS_URL and the phoenix image path are resolved against
 *    import.meta.env.BASE_URL, since both moved under public/ (plan A2) and must
 *    still resolve under the GitHub Pages sub-path in production.
 */
import { Fragment, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { reduceMotionOnce } from '../lib/motion';
import { LuVolume2, LuVolumeX } from 'react-icons/lu';

const WORKER_URL = 'https://mirc-2026-chat.plm-mirc2026.workers.dev';
const CHAT_URL = import.meta.env.DEV ? '/chat' : `${WORKER_URL}/chat`;
const CORPUS_URL = `${import.meta.env.BASE_URL}data/chat-corpus.json`;
const MARK = `${import.meta.env.BASE_URL}assets/dan-phoenix.png`;

const MAX_CHARS = 600;
const HISTORY_TURNS = 8;
const RATE = { windowMs: 60000, max: 10 };

const FALLBACK_SUGGESTIONS = [
  'Where is the venue?',
  'Where can I eat near the venue?',
  'What is there to see in Intramuros?'
];

const DEFAULT_DECLINE =
  'I can only help with MIRC 2026 and getting around Intramuros. Ask me about the ' +
  'programme, a session, the venue, registration, or where to eat nearby.';

// Mirrors the clearest cases the Worker rejects, so the most obvious off-topic
// asks never leave the browser. Kept narrow on purpose -- anything less than
// certain goes to the server, which can read the whole question in context.
const OFF_TOPIC = [
  /```/,
  /\b(?:write|generate|create|fix|debug|refactor)\b[^.?!]{0,40}\b(?:code|function|script|program|regex|sql|query|algorithm)\b/i,
  /\bin\s+(?:python|javascript|typescript|java|c\+\+|c#|php|ruby|golang|rust)\b/i,
  /\bwrite\s+(?:me\s+)?(?:an?|the|my)\s+(?:essay|poem|song|story|letter|email|blog|article|caption|speech|thesis|assignment|homework)\b/i,
  /\b(?:ignore|disregard|forget)\b[^.?!]{0,30}\b(?:previous|prior|above|your)\b[^.?!]{0,20}\b(?:instruction|prompt|rule)/i,
  /\b(?:system prompt|your instructions|jailbreak|developer mode)\b/i
];

// "Where is the change-view / Intramuros map button?" -- a question about this
// app's own UI, which the Worker's corpus knows nothing about, so it is answered
// here, deterministically, and the button itself is highlighted. Needs a
// view/switch/button word next to "map" so venue questions ("where is PLM?")
// still go to the server.
const VIEW_TOGGLE_Q = [
  /\b(?:change|switch|toggle|swap)\w*\s+(?:the\s+|map\s+)?(?:views?|maps?)\b/i,
  /\b(?:intramuros|plm|campus|full|whole)\s+map\s+(?:button|toggle|switch)\b/i,
  /\b(?:view|map)\s+(?:button|toggle|switch(?:er)?)\b/i
];
const VIEW_TOGGLE_REPLY =
  "It's the small button with the layers icon at the top-left of the map, just under the + and − zoom buttons. " +
  "I've made it glow for you. Tap it to switch between the PLM campus map and the full Intramuros map.";

// Pronunciation dictionary for text-to-speech only -- never touches what is
// rendered on screen (speak() runs this over a copy of the reply text right
// before handing it to SpeechSynthesisUtterance). Web Speech engines differ by
// device, and neither IPA nor SSML is reliably supported across them, so this
// is respelling with ordinary letters -- the same trick screen-reader users'
// dictionaries use -- not phonetic notation.
//
// Two kinds of entries, in this order (longer phrases before the single words
// they contain, so "Gusaling Katipunan" is respelled as a whole before the
// bare "Katipunan" rule can fire inside what it already replaced):
//   1. Track and building CODES are spelled out letter by letter -- that is
//      how a code like "STEA" or "BTB" is meant to be read, not guessed at as
//      a made-up word. Matched case-sensitively (no /i) so this only fires on
//      the corpus's own upper-case codes and never touches an ordinary word.
//   2. Filipino institutional and place names are respelled to guide the
//      engine's letter-to-sound rules toward the standard stress pattern.
//
// Deliberately NOT included: the people credited in "who made you" (Apelledo,
// Santiago, Genota, Cortez, Medina, Manubay) and conference speakers' names.
// Guessing at how someone's own name is pronounced risks being wrong in a way
// that leaving the engine's default never is. If the committee or a named
// person wants Dan to say a name a specific way, add it here following the
// same [pattern, respelling] shape.
const PRONOUNCE: [RegExp, string][] = [
  // -- phrases (before the single-word rules below) --
  [/\bPamantasan ng Lungsod ng Maynila\b/gi, 'Pah-mahn-TAH-sahn nahng LOONG-sod nahng my-NEE-lah'],
  [/\bBukod Tanging Bulwagan\b/gi, 'Boo-KOD Tahn-GHEENG Bool-WAH-gahn'],
  [/\bGusaling Emilio Ejercito(?: Sr\.?)?\b/gi, 'Goo-SAH-ling Eh-MEEL-yo Eh-HER-see-to'],
  [/\bGusaling Don Pepe Atienza\b/gi, 'Goo-SAH-ling Don PEH-peh Ah-tee-EN-sah'],
  [/\bGusaling Arsenio Lacson\b/gi, 'Goo-SAH-ling Ar-SEN-yo LAHK-son'],
  [/\bGusaling Katipunan\b/gi, 'Goo-SAH-ling Kah-tee-POO-nahn'],
  [/\bGusaling Intramuros\b/gi, 'Goo-SAH-ling In-trah-MOO-ros'],
  [/\bJusto Albert Auditorium\b/gi, 'HOOS-to Al-BERT Auditorium'],
  [/\bKatipunan Lounge\b/gi, 'Kah-tee-POO-nahn Lounge'],
  [/\bRajah Sulayman Gymnasium\b/gi, 'RAH-hah Soo-LIGH-mahn Gymnasium'],
  [/\bBahay Maynila\b/gi, 'BAH-high my-NEE-lah'],
  // -- single Filipino words (fallback for any other occurrence) --
  [/\bIntramuros\b/gi, 'In-trah-MOO-ros'],
  [/\bKatipunan\b/gi, 'Kah-tee-POO-nahn'],
  [/\bMaynila\b/gi, 'my-NEE-lah'],
  [/\bLungsod\b/gi, 'LOONG-sod'],
  [/\bGusaling\b/gi, 'Goo-SAH-ling'],
  [/\bPamantasan\b/gi, 'Pah-mahn-TAH-sahn'],
  // -- codes, spelled out letter by letter (case-sensitive on purpose) --
  [/\bPLM\b/g, 'P. L. M.'],
  [/\bSTEA\b/g, 'S. T. E. A.'],
  [/\bBGL\b/g, 'B. G. L.'],
  [/\bEASS\b/g, 'E. A. S. S.'],
  [/\bHS\b/g, 'H. S.'],
  [/\bJAA\b/g, 'J. A. A.'],
  [/\bGK\b/g, 'G. K.'],
  [/\bGEE\b/g, 'G. E. E.'],
  [/\bGA\b/g, 'G. A.'],
  [/\bBTB\b/g, 'B. T. B.'],
  [/\bKL\b/g, 'K. L.'],
  [/\bAVR\b/g, 'A. V. R.']
];

function toSpeech(text: string): string {
  let out = text;
  for (const [pattern, respelling] of PRONOUNCE) out = out.replace(pattern, respelling);
  return out;
}

// Voice selection for window.speechSynthesis.
//
// THE LIMIT THIS WORKS WITHIN: the browser only ever offers whichever voices
// the OS shipped or downloaded -- Windows/Edge expose Microsoft's "... Natural"
// neural voices, Android's Chrome exposes Google's voices, iOS/macOS Safari
// expose Apple's ("Daniel", "Samantha", ...). There is no voice name or id
// that exists on all three, so no ranking here can make two different devices
// play back the literal same voice -- only the closest match each one has.
// Getting byte-identical audio everywhere would need a server-side TTS call
// (see CHATBOT.md); this stays inside the free, client-only design and picks
// the best-sounding, most consistent-*sounding* option each device actually
// has, in the same priority order everywhere so the *behaviour* is consistent
// even when the *voice* cannot be.
//
// Priority: a neural/"Natural" voice (Edge) > a named male voice this device
// happens to expose (Edge, Safari/macOS's "Daniel", occasional Chrome/Android
// voices) > any other English voice. `\b...\b` word-boundaries matter here --
// a bare substring check for "male" also matches inside "Female", which
// silently picked a female voice half the time this ran without them.
const MALE_VOICE_RE = /\b(?:male|guy|christopher|eric|andrew|brian|tony|daniel|david|mark|fred|james|ryan|alex)\b/i;

function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  const english = voices.filter(v => v.lang.toLowerCase().startsWith('en'));
  const natural = english.filter(v => v.name.includes('Natural'));
  return (
    natural.find(v => MALE_VOICE_RE.test(v.name)) ??
    natural[0] ??
    english.find(v => v.name.includes('Mark')) ??
    english.find(v => MALE_VOICE_RE.test(v.name)) ??
    english[0] ??
    voices[0]
  );
}

/** What worker/src/focus.js returns for a question that plainly names one
 *  eat/see/stay spot -- or asks where the PLM venue or one of its buildings is
 *  ('landmark') -- matched against the corpus's own records server-side, never
 *  invented by the model, so `id` always names a real marker. */
interface ChatFocus { kind: 'eat' | 'see' | 'stay' | 'landmark'; id: string; name: string; lat: number; lng: number; }

interface ChatMessage {
  id: number;
  role: 'user' | 'bot';
  text: string;
  muted?: boolean;
  thinking?: boolean;
  focus?: ChatFocus;
  /** Answer to "where is the change-view button?" -- renders a "Show me" action. */
  pointsAtToggle?: boolean;
}

interface HistoryTurn { role: 'user' | 'assistant'; content: string; }

export interface ChatPanelProps {
  /** Fly the map to a spot by id and open its popup; false if the id is not a
   *  real spot. Wired to useLeafletMap's focusById via App.tsx. */
  onFocus?: (id: string) => boolean;
  /** Pulse the map's PLM/Intramuros view toggle (App's highlightViewToggle). */
  onHighlightViewToggle?: () => void;
}

function MessageBody({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n{2,}/).map((para, i) => (
        <p key={i}>
          {para.split('\n').map((line, j, arr) => (
            <Fragment key={j}>{line}{j < arr.length - 1 && <br />}</Fragment>
          ))}
        </p>
      ))}
    </>
  );
}

export function ChatPanel({ onFocus, onHighlightViewToggle }: ChatPanelProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>(FALLBACK_SUGGESTIONS);
  const [inputValue, setInputValue] = useState('');
  const [voiceEnabled, setVoiceEnabled] = useState(true);

  const voiceEnabledRef = useRef(true);
  const openRef = useRef(false);
  const busyRef = useRef(false);
  const builtRef = useRef(false);
  const corpusLoadedRef = useRef(false);
  const historyRef = useRef<HistoryTurn[]>([]);
  const hitsRef = useRef<number[]>([]);
  const declineRef = useRef(DEFAULT_DECLINE);
  const lastFocusRef = useRef<HTMLElement | null>(null);
  const nextId = useRef(0);

  const panelRef = useRef<HTMLElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current && (logRef.current.scrollTop = logRef.current.scrollHeight);
  }, [messages]);

  useEffect(() => {
    if (window.speechSynthesis && window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
    }
  }, []);

  function speak(text: string) {
    if (!voiceEnabledRef.current || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(toSpeech(text));
    // Fixed regardless of the engine's own default, so speed/pitch/volume read
    // the same on every device even though the voice itself cannot (see the
    // note above pickVoice).
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 1;
    const voice = pickVoice(window.speechSynthesis.getVoices());
    if (voice) utterance.voice = voice;
    window.speechSynthesis.speak(utterance);
  }

  const toggleVoice = () => {
    const next = !voiceEnabled;
    setVoiceEnabled(next);
    voiceEnabledRef.current = next;
    if (!next && window.speechSynthesis) window.speechSynthesis.cancel();
  };

  function appendMessage(msg: Omit<ChatMessage, 'id'>): number {
    const id = ++nextId.current;
    setMessages(m => [...m, { ...msg, id }]);
    return id;
  }
  function removeMessage(id: number) {
    setMessages(m => m.filter(x => x.id !== id));
  }

  // Only for the suggested questions and the decline wording, so those stay in
  // step with what the committee wrote. A failure here is not worth surfacing.
  async function loadCorpus() {
    if (corpusLoadedRef.current) return;
    corpusLoadedRef.current = true;
    try {
      const res = await fetch(CORPUS_URL, { cache: 'no-cache' });
      if (!res.ok) return;
      const corpus = await res.json();
      if (Array.isArray(corpus.scope?.suggestions) && corpus.scope.suggestions.length) {
        setSuggestions(corpus.scope.suggestions);
      }
      if (typeof corpus.scope?.decline === 'string') declineRef.current = corpus.scope.decline;
    } catch {
      // suggestions stay on their fallbacks
    }
  }

  function rateLimited(): boolean {
    const now = Date.now();
    hitsRef.current = hitsRef.current.filter(t => now - t < RATE.windowMs);
    if (hitsRef.current.length >= RATE.max) return true;
    hitsRef.current.push(now);
    return false;
  }

  function setBusyBoth(on: boolean) {
    busyRef.current = on;
    setBusy(on);
  }

  async function send(overrideValue?: string) {
    const message = (overrideValue ?? inputValue).trim();
    if (!message || busyRef.current) return;

    appendMessage({ role: 'user', text: message });
    setInputValue('');
    if (inputRef.current) inputRef.current.style.height = 'auto';

    if (rateLimited()) {
      const msg = 'Give me a moment to catch up — try again in a few seconds.';
      appendMessage({ role: 'bot', text: msg, muted: true });
      speak(msg);
      return;
    }

    // Layer 0: the obviously off-topic never reaches the network.
    if (OFF_TOPIC.some(re => re.test(message))) {
      appendMessage({ role: 'bot', text: declineRef.current });
      speak(declineRef.current);
      return;
    }

    if (VIEW_TOGGLE_Q.some(re => re.test(message))) {
      appendMessage({ role: 'bot', text: VIEW_TOGGLE_REPLY, pointsAtToggle: true });
      speak(VIEW_TOGGLE_REPLY);
      onHighlightViewToggle?.();
      return;
    }

    if (!WORKER_URL) {
      const msg = "I'm not switched on yet. The organisers still need to publish the MIRC 2026 programme and connect me — until then this panel is here, but I cannot answer.";
      appendMessage({
        role: 'bot',
        text: msg,
        muted: true
      });
      speak(msg);
      return;
    }

    setBusyBoth(true);
    const thinkingId = appendMessage({ role: 'bot', text: '', thinking: true });

    try {
      const res = await fetch(CHAT_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message, history: historyRef.current.slice(-HISTORY_TURNS) })
      });
      const data = await res.json().catch(() => ({}));
      removeMessage(thinkingId);

      const reply = data.reply || 'I could not answer that one. Try asking it another way.';
      const focus: ChatFocus | undefined = data.focus?.id ? data.focus : undefined;
      appendMessage({ role: 'bot', text: reply, focus });
      speak(reply);

      // The map follows the answer, not the other way round: fly to it once the
      // reply naming it has actually landed, never speculatively while waiting.
      if (focus) onFocus?.(focus.id);

      // Declines and errors are not worth carrying into the next question.
      if (!data.declined && !data.retry && res.ok) {
        historyRef.current = [
          ...historyRef.current,
          { role: 'user', content: message } satisfies HistoryTurn,
          { role: 'assistant', content: reply } satisfies HistoryTurn
        ].slice(-HISTORY_TURNS);
      }
    } catch {
      removeMessage(thinkingId);
      const msg = 'I could not reach the assistant. Check your connection and try again — or ask at the registration desk.';
      appendMessage({
        role: 'bot',
        text: msg,
        muted: true
      });
      speak(msg);
    } finally {
      setBusyBoth(false);
      inputRef.current?.focus();
    }
  }

  function openPanel() {
    lastFocusRef.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    if (panel) {
      panel.hidden = false;
      // Force a reflow so the transition runs from the un-hidden state. A rAF
      // would read better but does not fire in a throttled or backgrounded tab,
      // which left the panel visible-but-transparent.
      void panel.offsetHeight;
      panel.classList.add('is-open');
    }
    openRef.current = true;
    setOpen(true);

    if (!builtRef.current) {
      builtRef.current = true;
      const msg = "I'm Dan. I can help with MIRC 2026 — the programme, sessions, the venue at PLM, registration — and with finding your way around Intramuros. What do you need?";
      appendMessage({
        role: 'bot',
        text: msg
      });
      speak(msg);
      loadCorpus();
    }
    inputRef.current?.focus();
  }

  function closePanel() {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    panelRef.current?.classList.remove('is-open');
    openRef.current = false;
    setOpen(false);
    // Guarded, so a re-open during the fade is not hidden by the stale timer.
    const hide = () => { if (!openRef.current && panelRef.current) panelRef.current.hidden = true; };
    if (reduceMotionOnce) hide(); else setTimeout(hide, 220);
    if (lastFocusRef.current && document.contains(lastFocusRef.current)) lastFocusRef.current.focus();
    else launcherRef.current?.focus();
  }

  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      if (e.key === 'Escape' && openRef.current) { e.stopPropagation(); closePanel(); }
    }
    document.addEventListener('keydown', onKeydown);
    return () => document.removeEventListener('keydown', onKeydown);
  }, []);

  function onInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInputValue(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }

  function onInputKeydown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  }

  // The launcher stays in .mapwrap (its position:absolute is anchored to it,
  // app.js:346-347 appended it there); the panel portals to document.body, since
  // it is position:fixed and app.js:348 appended it there too -- matching the
  // original DOM structure exactly rather than relying on .chat's fixed
  // positioning happening to still work if it were nested instead.
  return (
    <>
      <button type="button" className={`chat-launch${open ? ' is-on' : ''}`} ref={launcherRef}
        aria-expanded={open} aria-controls="chatPanel"
        title="Ask Dan about MIRC 2026" aria-label="Ask Dan about MIRC 2026"
        onClick={() => (openRef.current ? closePanel() : openPanel())}>
        <img className="phx phx--sm" src={MARK} alt="" aria-hidden="true" draggable={false} />
        <span className="chat-launch__text">Ask Dan</span>
      </button>

      {createPortal(
      <section className={`chat${open ? ' is-open' : ''}${busy ? ' is-busy' : ''}`} id="chatPanel"
        ref={panelRef} hidden aria-label="Dan, the MIRC 2026 assistant">
        <header className="chat__head">
          <div className="chat__ident">
            <img className="phx phx--lg" src={MARK} alt="" aria-hidden="true" draggable={false} />
            <div>
              <p className="chat__eyebrow">MIRC 2026</p>
              <h2 className="chat__title">Dan</h2>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button type="button" aria-label={voiceEnabled ? "Mute Voice" : "Unmute Voice"} onClick={toggleVoice} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', padding: '0 8px', display: 'flex', alignItems: 'center', color: 'inherit' }}>
              {voiceEnabled ? <LuVolume2 /> : <LuVolumeX />}
            </button>
            <button type="button" className="chat__close" aria-label="Close Dan" onClick={closePanel}>&times;</button>
          </div>
        </header>

        <div className="chat__log" ref={logRef} role="log" aria-live="polite" aria-atomic="false">
          {messages.map(m => (
            m.thinking
              ? <div key={m.id} className="chat__msg chat__msg--bot chat__thinking" aria-label="Thinking">
                  <span></span><span></span><span></span>
                </div>
              : <div key={m.id} className={`chat__msg chat__msg--${m.role}${m.muted ? ' is-muted' : ''}`}>
                  <MessageBody text={m.text} />
                  {m.focus && (
                    <button type="button" className="chat__locate" onClick={() => onFocus?.(m.focus!.id)}>
                      <svg viewBox="0 0 16 16" aria-hidden="true">
                        <path d="M8 14.5S13 10 13 6.4a5 5 0 0 0-10 0C3 10 8 14.5 8 14.5z" />
                        <circle cx="8" cy="6.3" r="1.7" />
                      </svg>
                      Show {m.focus.name} on the map
                    </button>
                  )}
                  {/* On a phone the open panel covers the map, so the pulse is
                      only seen once the panel is out of the way. */}
                  {m.pointsAtToggle && (
                    <button type="button" className="chat__locate" onClick={() => { closePanel(); onHighlightViewToggle?.(); }}>
                      <svg viewBox="0 0 16 16" aria-hidden="true">
                        <path d="M8 14.5S13 10 13 6.4a5 5 0 0 0-10 0C3 10 8 14.5 8 14.5z" />
                        <circle cx="8" cy="6.3" r="1.7" />
                      </svg>
                      Show me the button
                    </button>
                  )}
                </div>
          ))}
        </div>

        <div className="chat__suggest">
          {!busy && suggestions.slice(0, 3).map((q, i) => (
            <button key={i} type="button" className="chat__chip" onClick={() => send(q)}>{q}</button>
          ))}
        </div>

        <form className="chat__form" onSubmit={e => { e.preventDefault(); send(); }}>
          <label className="chat__label" htmlFor="chatInput">Your question</label>
          <textarea id="chatInput" className="chat__input" rows={1} maxLength={MAX_CHARS}
            placeholder="Ask about a session or the venue…"
            autoComplete="off" spellCheck={false}
            ref={inputRef} value={inputValue} disabled={busy}
            onChange={onInputChange} onKeyDown={onInputKeydown} />
          <button type="submit" className="chat__send" aria-label="Send" disabled={busy}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 8h11M8.6 3.4 13.2 8l-4.6 4.6" /></svg>
          </button>
        </form>

        <p className="chat__foot">Answers come from the congress material only. Check anything
          critical at the registration desk.</p>
      </section>,
      document.body
      )}
    </>
  );
}
