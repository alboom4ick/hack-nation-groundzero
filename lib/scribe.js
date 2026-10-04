// Single-use token for Scribe v2 Realtime, minted server-side so the browser never holds the API key.
export async function scribeToken(apiKey, fetchImpl = fetch) {
  const res = await fetchImpl('https://api.elevenlabs.io/v1/single-use-token/realtime_scribe', { method: 'POST', headers: { 'xi-api-key': apiKey } });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const { token } = await res.json();
  if (!token) throw new Error('no token in ElevenLabs response');
  return token;
}
