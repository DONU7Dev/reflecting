import { LocaleType } from '@univerjs/presets';

// Blank templates in original wording. Edit the text below to change headings.
export const SECTIONS = [
  { key: 'resentments', name: 'Resentments', who: 'I am resentful toward', what: 'What happened, and why I am angry or bitter' },
  { key: 'fears', name: 'Fears', who: 'I am afraid of', what: 'What happened, and why I am afraid' },
  { key: 'harmsToMe', name: 'Harms To Me', who: 'I was hurt by', what: 'What was done, and how it hurt me' },
  { key: 'harmsByMe', name: 'Harms By Me', who: 'I hurt', what: 'What I did, and how it affected them' },
  { key: 'sexual', name: 'Sexual', who: 'Person or situation', what: 'Where I stepped outside God’s design' },
  { key: 'recovery', name: 'Recovery Issue', who: 'My struggle, and who it affected', what: 'How I caused harm' },
];
const HEAD = (s) => [s.who, s.what, 'How I responded (actions, choices, feelings)', 'The nature of my response', 'What I was protecting or desiring', 'Notes & reflections'];
const W = [210, 280, 280, 190, 240, 220];
export const COL_WEIGHTS = W;
const PAD = { t: 4, b: 4, l: 10, r: 10 };

export function blankPage(s, id) {
  const cd = { 0: {}, 1: {} };
  HEAD(s).forEach((h, c) => { cd[1][c] = { v: h, s: 'h' }; });
  for (let c = 0; c < 6; c++) cd[0][c] = { v: c === 0 ? s.name.toUpperCase() + ' INVENTORY' : '', s: 't' };
  for (let r = 2; r < 60; r++) { cd[r] = {}; for (let c = 0; c < 6; c++) cd[r][c] = { s: 'w' }; }
  const columnData = {}; W.forEach((w, i) => (columnData[i] = { w }));
  return {
    id, name: s.name, appVersion: '1.0.0', locale: LocaleType.EN_US, sheetOrder: ['s1'],
    styles: {
      t: { bl: 1, fs: 16, cl: { rgb: '#FFFFFF' }, bg: { rgb: '#556B2F' }, ht: 2, vt: 2, pd: PAD },
      h: { bl: 1, fs: 12, cl: { rgb: '#3B4A1F' }, bg: { rgb: '#E9DDB8' }, tb: 3, ht: 2, vt: 2, pd: PAD },
      w: { tb: 3, vt: 1, fs: 12, pd: PAD },
    },
    sheets: { s1: { id: 's1', name: s.name, rowCount: 60, columnCount: 6, cellData: cd, columnData,
      rowData: { 0: { h: 40 }, 1: { h: 56 } }, mergeData: [{ startRow: 0, endRow: 0, startColumn: 0, endColumn: 5 }] } },
  };
}
