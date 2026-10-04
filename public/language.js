// S2: the expert may work in any language the speech + voice stack supports; the tutor stays in English.
// Quotes keep the expert's language. Codes are ISO 639-1, labels are in the language itself.
export const LANGUAGES = {
  en: 'English', de: 'Deutsch', fr: 'Français', es: 'Español', it: 'Italiano', pt: 'Português', nl: 'Nederlands',
  pl: 'Polski', cs: 'Čeština', sk: 'Slovenčina', uk: 'Українська', ru: 'Русский', ro: 'Română', hu: 'Magyar',
  bg: 'Български', hr: 'Hrvatski', el: 'Ελληνικά', tr: 'Türkçe', sv: 'Svenska', da: 'Dansk', no: 'Norsk', fi: 'Suomi',
  ar: 'العربية', he: 'עברית', hi: 'हिन्दी', bn: 'বাংলা', id: 'Bahasa Indonesia', vi: 'Tiếng Việt', th: 'ไทย',
  ja: '日本語', ko: '한국어', zh: '中文', ta: 'தமிழ்', ms: 'Bahasa Melayu', fil: 'Filipino',
};
const KEY = 'groundzero.language';

export function getLanguage() {
  try { const v = localStorage.getItem(KEY); if (v in LANGUAGES) return v; } catch { /* storage unavailable */ }
  return 'en';
}
export function setLanguage(code) {
  if (!(code in LANGUAGES)) return;
  try { localStorage.setItem(KEY, code); } catch { /* storage unavailable */ }
}
