/** Meeting workspace contract. Mirrored in web/mobile; tested with identical fixtures. */
export interface AgendaItem { id: string; text: string; done: boolean }
export interface MeetingExport {
  title: string; date: string; time: string; durationMinutes: number;
  location?: string; link?: string; agenda?: AgendaItem[];
}
export type AgendaChange =
  | { kind: 'add'; item: AgendaItem }
  | { kind: 'set'; id: string; done: boolean }
  | { kind: 'rename'; id: string; text: string }
  | { kind: 'remove'; id: string };
export function changeAgenda(items: readonly AgendaItem[] = [], change: AgendaChange): AgendaItem[] {
  if (change.kind === 'add') {
    const text = change.item.text.trim();
    if (!text || items.some(item => item.id === change.item.id)) return [...items];
    return [...items, { ...change.item, text }];
  }
  if (change.kind === 'remove') return items.filter(item => item.id !== change.id);
  return items.map(item => item.id !== change.id ? item : change.kind === 'set'
    ? { ...item, done: change.done }
    : { ...item, text: change.text.trim() || item.text });
}
export function meetingText(m: MeetingExport, agenda = false, english = false): string {
  const lines = [m.title, `${m.date} · ${m.time || '—'} · ${m.durationMinutes} ${english ? 'min' : 'хв'}`];
  if (m.location) lines.push(`${english ? 'Location' : 'Місце'}: ${m.location}`);
  if (m.link) lines.push(`${english ? 'Join' : 'Приєднатися'}: ${m.link}`);
  if (agenda) {
    lines.push('', english ? 'AGENDA' : 'ПОРЯДОК ДЕННИЙ');
    lines.push(...(m.agenda?.length ? m.agenda.map((item, i) => `${i + 1}. [${item.done ? 'x' : ' '}] ${item.text}`) : [english ? 'No items yet' : 'Пунктів поки немає']));
  }
  return lines.join('\n');
}
function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}
export function meetingAgendaHtml(m: MeetingExport, english = false): string {
  return `<!doctype html><html lang="${english ? 'en' : 'uk'}"><head><meta charset="utf-8"><title>${escapeHtml(m.title)}</title><style>
  @page { size: A4; margin: 18mm; } * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, Arial, sans-serif; color: #172b4d; font-size: 12pt; line-height: 1.5; }
  header { border-bottom: 3px solid #6554c0; padding-bottom: 14px; margin-bottom: 24px; }
  .brand { color: #6554c0; font-weight: 700; letter-spacing: 2px; }
  h1 { font-size: 24pt; margin: 8px 0; overflow-wrap: anywhere; } h2 { font-size: 16pt; }
  p, li { white-space: pre-wrap; overflow-wrap: anywhere; } li { break-inside: avoid; padding: 10px 0; border-bottom: 1px solid #dfe1e6; }
  .done { color: #42526e; } footer { margin-top: 28px; color: #6b778c; font-size: 9pt; }
  </style></head><body><header><span class="brand">FLOWI</span><h1>${escapeHtml(m.title)}</h1><p>${escapeHtml(meetingText(m, false, english).split('\n').slice(1).join('\n'))}</p></header>
  <h2>${english ? 'Agenda' : 'Порядок денний'}</h2><ol>${(m.agenda ?? []).map(item => `<li class="${item.done ? 'done' : ''}">${item.done ? '☑' : '☐'} ${escapeHtml(item.text)}</li>`).join('')}</ol>
  ${m.agenda?.length ? '' : `<p>${english ? 'No items yet' : 'Пунктів поки немає'}</p>`}<footer>Flowi · ${english ? 'Meeting agenda' : 'Порядок денний зустрічі'}</footer></body></html>`;
}
