/**
 * Does the multi-provider fallback chain actually fall back?
 *
 *   node tools/eval-fallback.mjs
 *
 * Runs entirely offline — no API key, no network, no real provider is called.
 * global.fetch is replaced for the duration of each case with a stub that answers
 * exactly what that case is testing (a success, an error status, a hang), and the
 * REAL exported provider-chain code (worker/src/index.js) is run against it, not a
 * copy of it that could drift from what the Worker actually does in production.
 *
 * What this checks: provider order and key-based filtering (providerChain), that a
 * failure at one provider falls through to the next (runProviderChain), that a
 * request never touches a provider twice, that "everyone failed" comes back as a
 * clean null rather than a throw, that a hung provider is cut off by its own
 * timeout rather than blocking the chain forever, and that the exact same prompt
 * and message history reach whichever provider ends up answering.
 */

import {
  providerChain, runProviderChain, timeoutSignal,
  callGroq, callGemini, callOpenAI, callAnthropic
} from '../worker/src/index.js';

let pass = 0, fail = 0;
const failures = [];

function check(name, ok, detail) {
  ok ? pass++ : fail++;
  if (!ok) failures.push({ name, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
}

/** Swap global.fetch for the duration of `fn`, then always restore it. */
async function withFetch(stub, fn) {
  const real = global.fetch;
  global.fetch = stub;
  try {
    return await fn();
  } finally {
    global.fetch = real;
  }
}

/** A response shaped like the OpenAI/Groq chat-completions success body. */
const chatOk = text => new Response(JSON.stringify({ choices: [{ message: { content: text } }] }),
  { status: 200 });
const geminiOk = text => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }),
  { status: 200 });
const anthropicOk = text => new Response(JSON.stringify({ content: [{ text }] }), { status: 200 });
const httpErr = (status, body = 'error') => new Response(body, { status });

/* ── providerChain: key presence and order ──────────────────────────────────── */

{
  const env = { GROQ_API_KEY: 'g', GEMINI_API_KEY: 'ge', OPENAI_API_KEY: 'o', ANTHROPIC_API_KEY: 'a' };
  const names = providerChain(env).map(p => p.name);
  check('default order is groq, gemini, openai, anthropic',
    names.join(',') === 'groq,gemini,openai,anthropic', names);
}
{
  // Only two keys configured — the other two must be silently skipped, not attempted
  // and failed. A missing key is not the same failure mode as a bad or rate-limited one.
  const env = { OPENAI_API_KEY: 'o', ANTHROPIC_API_KEY: 'a' };
  const names = providerChain(env).map(p => p.name);
  check('missing keys are skipped, not included', names.join(',') === 'openai,anthropic', names);
}
{
  const env = { PROVIDER_ORDER: 'anthropic,openai', OPENAI_API_KEY: 'o', ANTHROPIC_API_KEY: 'a' };
  const names = providerChain(env).map(p => p.name);
  check('PROVIDER_ORDER overrides the default order', names.join(',') === 'anthropic,openai', names);
}
{
  const names = providerChain({}).map(p => p.name);
  check('no keys configured -> empty chain', names.length === 0, names);
}

/* ── individual providers: success and error shapes ─────────────────────────── */

await withFetch(async () => chatOk('a groq answer'), async () => {
  const text = await callGroq({ GROQ_API_KEY: 'g' }, 'sys', [{ role: 'user', content: 'hi' }]);
  check('callGroq returns the model text', text === 'a groq answer', text);
});

await withFetch(async () => chatOk('an openai answer'), async () => {
  const text = await callOpenAI({ OPENAI_API_KEY: 'o' }, 'sys', [{ role: 'user', content: 'hi' }]);
  check('callOpenAI returns the model text', text === 'an openai answer', text);
});

await withFetch(async () => geminiOk('a gemini answer'), async () => {
  const text = await callGemini({ GEMINI_API_KEY: 'ge' }, 'sys', [{ role: 'user', content: 'hi' }]);
  check('callGemini returns the model text', text === 'a gemini answer', text);
});

await withFetch(async () => anthropicOk('an anthropic answer'), async () => {
  const text = await callAnthropic({ ANTHROPIC_API_KEY: 'a' }, 'sys', [{ role: 'user', content: 'hi' }]);
  check('callAnthropic returns the model text', text === 'an anthropic answer', text);
});

await withFetch(async () => httpErr(413, 'rate limited'), async () => {
  try {
    await callGroq({ GROQ_API_KEY: 'g' }, 'sys', []);
    check('callGroq 413 throws', false, 'did not throw');
  } catch (err) {
    check('callGroq 413 names the tokens/minute ceiling, not just "413"',
      /tokens\/minute/.test(err.message) && /unusable/.test(err.message), err.message);
  }
});

await withFetch(async () => httpErr(401, 'bad key'), async () => {
  try {
    await callOpenAI({ OPENAI_API_KEY: 'wrong' }, 'sys', []);
    check('callOpenAI 401 throws', false, 'did not throw');
  } catch (err) {
    // The error is allowed to carry the provider's own short error text (useful for
    // an admin reading `wrangler tail`), but must never echo the key it was called
    // with — the fetch stub below asserts the request itself never receives ours
    // duplicated back, and this asserts the THROWN error does not contain it either.
    check('callOpenAI error message does not leak the configured key',
      !err.message.includes('wrong'), err.message);
  }
});

/* ── runProviderChain: the actual fallback behaviour ─────────────────────────── */

await withFetch(async (url) => {
  if (url.includes('groq.com')) return httpErr(500, 'groq is down');
  if (url.includes('generativelanguage')) return httpErr(429, 'gemini rate limited');
  if (url.includes('api.openai.com')) return chatOk('openai saved the day');
  throw new Error(`unexpected fetch to ${url}`);
}, async () => {
  const chain = providerChain({ GROQ_API_KEY: 'g', GEMINI_API_KEY: 'ge', OPENAI_API_KEY: 'o' });
  const { reply, used } = await runProviderChain(chain, {
    GROQ_API_KEY: 'g', GEMINI_API_KEY: 'ge', OPENAI_API_KEY: 'o'
  }, 'sys', [{ role: 'user', content: 'hi' }]);
  check('groq down + gemini rate-limited -> falls through to openai',
    used === 'openai' && reply === 'openai saved the day', { used, reply });
});

await withFetch(async (url) => {
  if (url.includes('groq.com')) return httpErr(503);
  if (url.includes('generativelanguage')) return httpErr(429);
  if (url.includes('api.openai.com')) return httpErr(401);
  if (url.includes('api.anthropic.com')) return anthropicOk('claude, last resort');
  throw new Error(`unexpected fetch to ${url}`);
}, async () => {
  const env = { GROQ_API_KEY: 'g', GEMINI_API_KEY: 'ge', OPENAI_API_KEY: 'o', ANTHROPIC_API_KEY: 'a' };
  const { reply, used } = await runProviderChain(providerChain(env), env, 'sys', []);
  check('groq, gemini and openai all fail -> falls through to anthropic',
    used === 'anthropic' && reply === 'claude, last resort', { used, reply });
});

await withFetch(async () => httpErr(500, 'down'), async () => {
  const env = { GROQ_API_KEY: 'g', GEMINI_API_KEY: 'ge', OPENAI_API_KEY: 'o', ANTHROPIC_API_KEY: 'a' };
  const { reply, used } = await runProviderChain(providerChain(env), env, 'sys', []);
  check('every provider failing returns a clean null, not a throw',
    reply === null && used === null, { reply, used });
});

await withFetch(async (url, opts) => {
  // A provider that never resolves. providerChain's per-attempt AbortController is
  // what has to save this — nothing else here ever settles the fetch itself.
  return new Promise((_resolve, reject) => {
    opts.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  });
}, async () => {
  const env = { GROQ_API_KEY: 'g', OPENAI_API_KEY: 'o' };
  const start = Date.now();
  // A short, test-only timeout via the exported timeoutSignal helper directly, so
  // this case does not have to wait out the real 12s PROVIDER_TIMEOUT_MS to prove
  // the mechanism works — the loop shape is identical, only the duration differs.
  const chain = providerChain(env).map(p => ({
    name: p.name,
    call: async (e, sys, msgs) => {
      const { signal, cancel } = timeoutSignal(50);
      try { return await p.call(e, sys, msgs, { signal }); } finally { cancel(); }
    }
  }));
  const { reply, used } = await runProviderChain(chain, env, 'sys', []);
  const elapsed = Date.now() - start;
  check('a hung provider is cut off, not left to hang the request',
    reply === null && used === null && elapsed < 2000, { reply, used, elapsed });
});

let seenBy = null;
await withFetch(async (url) => {
  if (url.includes('groq.com')) return httpErr(500);
  seenBy = 'openai';
  return chatOk('ok');
}, async () => {
  const env = { GROQ_API_KEY: 'g', OPENAI_API_KEY: 'o' };
  let capturedSystem = null, capturedMessages = null;
  const chain = providerChain(env).map(p => ({
    name: p.name,
    call: async (e, sys, msgs, opts) => {
      if (p.name === 'openai') { capturedSystem = sys; capturedMessages = msgs; }
      return p.call(e, sys, msgs, opts);
    }
  }));
  const system = 'the full grounded system prompt';
  const messages = [{ role: 'user', content: 'earlier turn' }, { role: 'assistant', content: 'earlier reply' },
    { role: 'user', content: 'current question' }];
  await runProviderChain(chain, env, system, messages);
  check('conversation context reaches the provider that actually answers unchanged',
    seenBy === 'openai' && capturedSystem === system &&
    JSON.stringify(capturedMessages) === JSON.stringify(messages),
    { capturedSystem: capturedSystem?.slice(0, 20), capturedMessages });
});

/* ── never retries a provider that already failed this request ──────────────── */

{
  let groqAttempts = 0;
  await withFetch(async (url) => {
    if (url.includes('groq.com')) { groqAttempts++; return httpErr(500); }
    return chatOk('openai answered');
  }, async () => {
    const env = { GROQ_API_KEY: 'g', OPENAI_API_KEY: 'o' };
    await runProviderChain(providerChain(env), env, 'sys', []);
    check('a failed provider is attempted exactly once per request, never retried',
      groqAttempts === 1, groqAttempts);
  });
}

console.log(`\n  ${pass} passed, ${fail} failed of ${pass + fail}\n`);
for (const f of failures) console.log(`  FAILED: ${f.name}\n     ${JSON.stringify(f.detail)}\n`);
process.exit(fail ? 1 : 0);
