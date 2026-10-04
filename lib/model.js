// The one place that talks to the vision / language model (Anthropic Messages API): a system prompt and content
// in, the JSON object the model answered with out. Every caller validates that object itself: it is untrusted.

export const MODEL = 'claude-sonnet-5-5';
const API = 'https://api.anthropic.com/v1/messages';

// "data:image/jpeg;base64,..." (a screen frame) -> an image content block
export function imageBlock(frame) {
  const m = String(frame).match(/^data:(image\/\w+);base64,(.+)$/);
  if (!m) throw new Error('frame must be a base64 data URL');
  return { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } };
}

// Models wrap JSON in prose or code fences as often as not, and sometimes emit a second object: take the first balanced {...}.
export function extractJson(text) {
  const t = String(text);
  for (let start = t.indexOf('{'); start !== -1; start = t.indexOf('{', start + 1)) {
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < t.length; i++) {
      const ch = t[i];
      if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
      if (ch === '"') inStr = true;
      else if (ch === '{') depth++;
      else if (ch === '}' && --depth === 0) {
        try { return JSON.parse(t.slice(start, i + 1)); } catch { break; }
      }
    }
  }
  throw new Error('no JSON in model output');
}

// content: a string, or an array of content blocks (text and images).
// Output that holds no JSON is usually a reply cut off by max_tokens or prose instead of JSON: retry once with double the budget.
export async function askModel({ system, content, maxTokens }, apiKey, fetchImpl = fetch, attempt = 0) {
  const res = await fetchImpl(API, {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json', ...(process.env.ANTHROPIC_WORKSPACE_ID ? { 'anthropic-workspace-id': process.env.ANTHROPIC_WORKSPACE_ID } : {}) },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content }] }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = await res.json();
  try {
    return extractJson(body.content.map((b) => b.text ?? '').join(''));
  } catch (err) {
    if (attempt === 0) return askModel({ system, content, maxTokens: maxTokens * 2 }, apiKey, fetchImpl, 1);
    throw new Error(body.stop_reason === 'max_tokens' ? `${err.message} (cut off at ${maxTokens} tokens)` : err.message);
  }
}
