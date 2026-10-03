// Step 6: ElevenLabs speech-to-text for the expert's spoken answer.
export async function transcribe(audio, mime, apiKey, { fetchImpl = fetch, model = 'scribe_v2' } = {}) {
  const form = new FormData();
  form.append('model_id', model);
  form.append('file', new Blob([audio], { type: mime || 'audio/webm' }), 'answer');
  const res = await fetchImpl('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: { 'xi-api-key': apiKey },
    body: form,
  });
  if (!res.ok) throw new Error(`ElevenLabs STT ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return String((await res.json()).text ?? '').trim();
}
