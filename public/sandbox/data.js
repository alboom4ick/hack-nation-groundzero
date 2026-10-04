// Fake invoices for the demo. Three are what the expert works on; the fourth (INV-4475, EUR 7,200 equipment)
// is the unseen case the new hire gets in the Teach module (README A4/T5). No real names, amounts or accounts.
export const COST_CENTERS = [
  { code: '4711', name: '4711 Opex: office and IT consumables' },
  { code: '0400', name: '0400 Capex: fixed assets' },
  { code: '6100', name: '6100 Services' },
];

export const INVOICES = [
  { id: 'INV-4471', supplier: 'Nordtech Maschinen GmbH', country: 'DE', category: 'Equipment', amount: 6400, po: 'PO-8812', date: '2026-09-14', asset: 'AST-2201', costCenter: '4711', note: 'CNC milling head, delivered' },
  { id: 'INV-4472', supplier: 'Brightwave Print (December double-biller)', country: 'DE', category: 'Services', amount: 880, po: 'PO-8830', date: '2026-12-02', asset: '', costCenter: '6100', note: 'Annual print run, same invoice number as last week' },
  { id: 'INV-4473', supplier: 'Moravia Components s.r.o.', country: 'CZ', category: 'Parts', amount: 1250, po: 'PO-8841', date: '2026-09-20', asset: '', costCenter: '4711', note: 'Czech subsidiary' },
  { id: 'INV-4475', supplier: 'Alpenlicht Systems AG', country: 'DE', category: 'Equipment', amount: 7200, po: 'PO-8853', date: '2026-09-27', asset: '', costCenter: '4711', note: 'Unseen case: equipment over 5,000 EUR, no asset number yet' },
];
