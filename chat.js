/**
 * MIRC 2026 assistant — the chat panel on the map.
 *
 * Self-contained: it builds its own launcher, panel and composer, and touches
 * nothing in app.js. Loading this file is all it takes to add the feature; deleting
 * the <script> tag removes it cleanly.
 *
 * The answer itself comes from the Worker in worker/ — the site is static and cannot
 * hold an API key, so every question is proxied. What happens here is the interface
 * plus two cheap guards: an obvious-off-topic filter that saves a round trip, and a
 * soft rate limit. The real enforcement is server-side; see worker/src/index.js.
 *
 * Until ENDPOINT is set the panel still opens and says plainly that it is not
 * connected yet, rather than failing at the first question.
 */
(function () {
  'use strict';

  /* ─────────────────────────────── configure me ──────────────────────────────
     The deployed Worker's URL. After `npx wrangler deploy` in worker/, paste the
     address it prints here — no trailing slash. Leave it empty to keep the panel
     in its "not connected yet" state. */
  const ENDPOINT = 'https://mirc-2026-chat.plm-mirc2026.workers.dev';
  /* ─────────────────────────────────────────────────────────────────────────── */

  const CORPUS_URL = 'data/chat-corpus.json';
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

  /* ───────────────────────────── helpers ─────────────────────────────────── */

  const $ = sel => document.querySelector(sel);

  const esc = s => String(s ?? '').replace(/[&<>"']/g, m =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Mirrors the clearest cases the Worker rejects, so the most obvious off-topic
     asks never leave the browser. Kept narrow on purpose — anything less than
     certain goes to the server, which can read the whole question in context. */
  const OFF_TOPIC = [
    /```/,
    /\b(?:write|generate|create|fix|debug|refactor)\b[^.?!]{0,40}\b(?:code|function|script|program|regex|sql|query|algorithm)\b/i,
    /\bin\s+(?:python|javascript|typescript|java|c\+\+|c#|php|ruby|golang|rust)\b/i,
    /\bwrite\s+(?:me\s+)?(?:an?|the|my)\s+(?:essay|poem|song|story|letter|email|blog|article|caption|speech|thesis|assignment|homework)\b/i,
    /\b(?:ignore|disregard|forget)\b[^.?!]{0,30}\b(?:previous|prior|above|your)\b[^.?!]{0,20}\b(?:instruction|prompt|rule)/i,
    /\b(?:system prompt|your instructions|jailbreak|developer mode)\b/i
  ];

  const state = {
    open: false,
    busy: false,
    built: false,
    history: [],
    hits: [],
    decline: DEFAULT_DECLINE,
    suggestions: FALLBACK_SUGGESTIONS,
    corpusLoaded: false,
    lastFocus: null
  };

  /* ───────────────────────────── the phoenix ─────────────────────────────── */

  /**
   * Dan's mark: the supplied phoenix artwork, cropped to the bird and scaled to
   * 256px wide (assets/dan-phoenix.png) so it stays crisp on a high-DPI screen at
   * the two sizes it is actually drawn at.
   *
   * It is 4:3, wider than it is tall, so it letterboxes inside the square slots the
   * CSS gives it — `object-fit: contain` keeps the proportions rather than squashing
   * the wings.
   *
   * Decorative: the launcher and the panel header both carry the name in text beside
   * it, and the launcher has its own aria-label, so the image is hidden from screen
   * readers instead of being announced twice.
   *
   * `size` is 'phx--sm' (launcher) or 'phx--lg' (panel header).
   */
  const MARK = 'assets/dan-phoenix.png';

  const phoenix = size =>
    `<img class="phx ${size}" src="${MARK}" alt="" aria-hidden="true" draggable="false">`;

  /* ───────────────────────────── the launcher ────────────────────────────── */

  const launcher = document.createElement('button');
  launcher.type = 'button';
  launcher.className = 'chat-launch';
  launcher.id = 'chatLaunch';
  launcher.setAttribute('aria-expanded', 'false');
  launcher.setAttribute('aria-controls', 'chatPanel');
  launcher.innerHTML = phoenix('phx--sm') + `<span class="chat-launch__text">Ask Dan</span>`;
  launcher.title = 'Ask Dan about MIRC 2026';
  launcher.setAttribute('aria-label', 'Ask Dan about MIRC 2026');

  /* ───────────────────────────── the panel ───────────────────────────────── */

  const panel = document.createElement('section');
  panel.className = 'chat';
  panel.id = 'chatPanel';
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Dan, the MIRC 2026 assistant');
  panel.innerHTML = `
    <header class="chat__head">
      <div class="chat__ident">
        ${phoenix('phx--lg')}
        <div>
          <p class="chat__eyebrow">MIRC 2026</p>
          <h2 class="chat__title">Dan</h2>
        </div>
      </div>
      <button type="button" class="chat__close" id="chatClose" aria-label="Close Dan">&times;</button>
    </header>

    <div class="chat__log" id="chatLog" role="log" aria-live="polite" aria-atomic="false"></div>

    <div class="chat__suggest" id="chatSuggest"></div>

    <form class="chat__form" id="chatForm">
      <label class="chat__label" for="chatInput">Your question</label>
      <textarea id="chatInput" class="chat__input" rows="1" maxlength="${MAX_CHARS}"
                placeholder="Ask about a session or the venue…"
                autocomplete="off" spellcheck="false"></textarea>
      <button type="submit" class="chat__send" id="chatSend" aria-label="Send">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 8h11M8.6 3.4 13.2 8l-4.6 4.6"/></svg>
      </button>
    </form>

    <p class="chat__foot">Answers come from the congress material only. Check anything
      critical at the registration desk.</p>
  `;

  /* ───────────────────────────── messages ────────────────────────────────── */

  function bubble(role, text, opts = {}) {
    const log = $('#chatLog');
    const el = document.createElement('div');
    el.className = `chat__msg chat__msg--${role}` + (opts.muted ? ' is-muted' : '');
    /* Plain text only — the prompt asks the model for plain text, and anything that
       arrives as markup is shown as the characters it is. */
    el.innerHTML = `<p>${esc(text).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>')}</p>`;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }

  function thinking() {
    const log = $('#chatLog');
    const el = document.createElement('div');
    el.className = 'chat__msg chat__msg--bot chat__thinking';
    el.innerHTML = '<span></span><span></span><span></span>';
    el.setAttribute('aria-label', 'Thinking');
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }

  function renderSuggestions() {
    const wrap = $('#chatSuggest');
    wrap.innerHTML = '';
    if (state.busy) return;
    for (const q of state.suggestions.slice(0, 3)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chat__chip';
      b.textContent = q;
      b.addEventListener('click', () => { $('#chatInput').value = q; send(); });
      wrap.appendChild(b);
    }
  }

  /* ───────────────────────────── corpus ──────────────────────────────────── */

  /* Only for the suggested questions and the decline wording, so those stay in step
     with what the committee wrote. A failure here is not worth surfacing. */
  async function loadCorpus() {
    if (state.corpusLoaded) return;
    state.corpusLoaded = true;
    try {
      const res = await fetch(CORPUS_URL, { cache: 'no-cache' });
      if (!res.ok) return;
      const corpus = await res.json();
      if (Array.isArray(corpus.scope?.suggestions) && corpus.scope.suggestions.length) {
        state.suggestions = corpus.scope.suggestions;
        renderSuggestions();
      }
      if (typeof corpus.scope?.decline === 'string') state.decline = corpus.scope.decline;
    } catch { /* suggestions stay on their fallbacks */ }
  }

  /* ───────────────────────────── sending ─────────────────────────────────── */

  function rateLimited() {
    const now = Date.now();
    state.hits = state.hits.filter(t => now - t < RATE.windowMs);
    if (state.hits.length >= RATE.max) return true;
    state.hits.push(now);
    return false;
  }

  function setBusy(on) {
    state.busy = on;
    $('#chatSend').disabled = on;
    $('#chatInput').disabled = on;
    /* The phoenix beats faster while Dan is composing — the icon carries the state,
       so the panel needs no separate spinner in its chrome. */
    panel.classList.toggle('is-busy', on);
    renderSuggestions();
  }

  async function send() {
    const input = $('#chatInput');
    const message = input.value.trim();
    if (!message || state.busy) return;

    bubble('user', message);
    input.value = '';
    input.style.height = 'auto';

    if (rateLimited()) {
      bubble('bot', 'Give me a moment to catch up — try again in a few seconds.', { muted: true });
      return;
    }

    /* Layer 0: the obviously off-topic never reaches the network. */
    if (OFF_TOPIC.some(re => re.test(message))) {
      bubble('bot', state.decline);
      return;
    }

    if (!ENDPOINT) {
      bubble('bot',
        "I'm not switched on yet. The organisers still need to publish the MIRC 2026 " +
        'programme and connect me — until then this panel is here, but I cannot answer.',
        { muted: true });
      return;
    }

    setBusy(true);
    const dots = thinking();

    try {
      const res = await fetch(`${ENDPOINT}/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message, history: state.history.slice(-HISTORY_TURNS) })
      });
      const data = await res.json().catch(() => ({}));
      dots.remove();

      const reply = data.reply || 'I could not answer that one. Try asking it another way.';
      bubble('bot', reply);

      /* Declines and errors are not worth carrying into the next question. */
      if (!data.declined && !data.retry && res.ok) {
        state.history.push({ role: 'user', content: message });
        state.history.push({ role: 'assistant', content: reply });
        state.history = state.history.slice(-HISTORY_TURNS);
      }
    } catch {
      dots.remove();
      bubble('bot',
        'I could not reach the assistant. Check your connection and try again — or ask ' +
        'at the registration desk.', { muted: true });
    } finally {
      setBusy(false);
      $('#chatInput').focus();
    }
  }

  /* ───────────────────────────── open / close ────────────────────────────── */

  function build() {
    if (state.built) return;
    state.built = true;

    $('#chatClose').addEventListener('click', close);

    $('#chatForm').addEventListener('submit', e => { e.preventDefault(); send(); });

    const input = $('#chatInput');
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
    /* Grow with the question, up to a few lines. */
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    });

    bubble('bot',
      "I'm Dan. I can help with MIRC 2026 — the programme, sessions, the venue at PLM, " +
      'registration — and with finding your way around Intramuros. What do you need?');

    renderSuggestions();
    loadCorpus();
  }

  function open() {
    state.lastFocus = document.activeElement;
    panel.hidden = false;
    build();
    /* Force a reflow so the transition runs from the un-hidden state. A rAF would
       read better but does not fire in a throttled or backgrounded tab, which left
       the panel visible-but-transparent. */
    void panel.offsetHeight;
    panel.classList.add('is-open');
    state.open = true;
    launcher.setAttribute('aria-expanded', 'true');
    launcher.classList.add('is-on');
    $('#chatInput').focus();
  }

  function close() {
    panel.classList.remove('is-open');
    state.open = false;
    launcher.setAttribute('aria-expanded', 'false');
    launcher.classList.remove('is-on');
    /* Guarded, so a re-open during the fade is not hidden by the stale timer. */
    const hide = () => { if (!state.open) panel.hidden = true; };
    if (reduceMotion) hide(); else setTimeout(hide, 220);
    if (state.lastFocus && document.contains(state.lastFocus)) state.lastFocus.focus();
    else launcher.focus();
  }

  launcher.addEventListener('click', () => (state.open ? close() : open()));

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && state.open) { e.stopPropagation(); close(); }
  });

  /* ───────────────────────────── boot ────────────────────────────────────── */

  const mapwrap = document.querySelector('.mapwrap');
  (mapwrap || document.body).appendChild(launcher);
  document.body.appendChild(panel);
})();
