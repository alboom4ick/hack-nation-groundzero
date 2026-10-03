// Step 5: ElevenLabs text-to-speech. Returns an mp3 Buffer.
const DEFAULT_VOICE = '21m00Tcm4TlvDq8ikWAM';

export async function speak(text, apiKey, { voiceId = DEFAULT_VOICE, fetchImpl = fetch } = {}) {
  const res = await fetchImpl(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_64`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: 'eleven_flash_v2_5' }),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return Buffer.from(await res.arrayBuffer());
}
