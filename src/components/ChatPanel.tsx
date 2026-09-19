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
}

interface HistoryTurn { role: 'user' | 'assistant'; content: string; }

export interface ChatPanelProps {
  /** Fly the map to a spot by id and open its popup; false if the id is not a
   *  real spot. Wired to useLeafletMap's focusById via App.tsx. */
  onFocus?: (id: string) => boolean;
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

export function ChatPanel({ onFocus }: ChatPanelProps) {
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
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const naturalMaleVoice = voices.find(v => v.lang.startsWith('en') && v.name.includes('Natural') && /(guy|christopher|eric|andrew|brian|tony|male)/i.test(v.name));
    const naturalAnyVoice = voices.find(v => v.lang.startsWith('en') && v.name.includes('Natural'));
    const markVoice = voices.find(v => v.name.includes('Mark'));
    
    if (naturalMaleVoice) {
      utterance.voice = naturalMaleVoice;
    } else if (naturalAnyVoice) {
      utterance.voice = naturalAnyVoice;
    } else if (markVoice) {
      utterance.voice = markVoice;
    } else {
      const fallback = voices.find(v => v.lang.startsWith('en') && (v.name.toLowerCase().includes('male') || v.name.toLowerCase().includes('guy'))) || voices.find(v => v.lang.startsWith('en'));
      if (fallback) utterance.voice = fallback;
    }
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
