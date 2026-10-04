// Personal data in what the expert says is replaced before it is stored or sent to a model.
const PII = [
  [/\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}(?:\s?[A-Z0-9]{1,4})?\b/g, '[IBAN]'],
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[EMAIL]'],
  [/\+?\d[\d\s().-]{8,}\d/g, '[PHONE]'],
];
export const redact = (text) => PII.reduce((t, [re, tag]) => t.replace(re, tag), text);
