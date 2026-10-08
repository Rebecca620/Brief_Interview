import { isVisual, safeLink } from './visuals/contract.js';
/**
 * Report is the aggregate saved by ReportRepository.
 * IDs are local to a report, except report IDs which identify library entries.
 * @typedef {{id:string, name:string, role:string}} Person
 * @typedef {{id:string, type:string, title:string, body:string, mentions:string[], owner?:string,
 * due?:string, source?:string, value?:number|string, target?:number|string, image?:string, alt?:string}} Card
 * @typedef {{id?:string, title:string, period:string, people:Person[], cards:Card[],
 * sources:Array<{name:string,detail:string,fingerprint?:string}>, updatedAt?:string}} Report
 */
export const CARD_TYPES = ['update', 'metric', 'decision', 'image'];
export const REPORT_SECTIONS = {
  progress: 'Progress',
  decision: 'Needs a decision',
  discussion: 'Needs discussion',
  next: 'Next steps',
  consensus: 'Key takeaways',
};
export const cardSection = (card) =>
  card.type === 'decision' ? 'decision' : card.section || 'progress';
export function assignSection(card, section) {
  if (!Object.hasOwn(REPORT_SECTIONS, section)) return;
  card.section = section;
  if (card.type === 'update' && section === 'decision') card.type = 'decision';
  else if (card.type === 'decision' && section !== 'decision') card.type = 'update';
}
export const reportSections = (cards) =>
  Object.entries(REPORT_SECTIONS)
    .map(([id, title]) => ({ id, title, cards: cards.filter((card) => cardSection(card) === id) }))
    .filter((section) => section.cards.length);
export const createId = () => crypto.randomUUID();
export const emptyReport = (title = '', period = '') => ({
  id: createId(),
  title,
  period,
  people: [],
  cards: [],
  sources: [],
});
export const createCard = (type = 'update', fields = {}) => ({
  id: createId(),
  type,
  title: 'Untitled snippet',
  body: '',
  owner: '',
  due: '',
  mentions: [],
  ...fields,
});

export function percent(value, target) {
  const numeric = (input) =>
    (typeof input === 'number' || typeof input === 'string') &&
    String(input).trim() !== '' &&
    Number.isFinite(Number(input));
  if (!numeric(value) || !numeric(target) || Number(value) < 0 || Number(target) <= 0) return null;
  const result = Math.round((Number(value) / Number(target)) * 100);
  return Number.isFinite(result) ? result : null;
}

export function isImageData(value) {
  return (
    typeof value === 'string' &&
    /^data:image\/(png|jpeg|webp);base64,(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value,
    ) &&
    value.split(',')[1].length > 0
  );
}

export function validateCard(card) {
  if (!card.title?.trim()) return 'Add a title for this card.';
  if (!CARD_TYPES.includes(card.type)) return 'Choose a supported card type.';
  if (card.type === 'metric' && percent(card.value, card.target) === null)
    return 'Enter a non-negative number and a target greater than zero.';
  if (card.type === 'image' && !isImageData(card.image))
    return 'Import an image before choosing the image card type.';
  return null;
}

/** Drafts may have unfinished descriptions or decisions. Sharing exposes these issues. */
export function checks(cards) {
  return cards.flatMap((card) => {
    const issues = [];
    const add = (text) => issues.push({ id: card.id, text });
    const validation = validateCard(card);
    if (validation) add(validation);
    if (card.type === 'decision' && !card.owner?.trim()) add('Assign a decision owner');
    if (card.type === 'decision' && !card.due?.trim()) add('Add a decision deadline');
    if (card.type === 'image' && !card.alt?.trim()) add('Describe the image for accessibility');
    return issues;
  });
}

export function audienceCards(cards, lens = 'team') {
  const priority = { decision: 0, metric: 1, update: 2, image: 3 };
  return lens === 'leadership'
    ? [...cards].sort((a, b) => priority[a.type] - priority[b.type])
    : [...cards];
}

const isId = (value) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
const optionalString = (value) => value === undefined || typeof value === 'string';
const uniqueIds = (items) => new Set(items.map((item) => item.id)).size === items.length;
const scalar = (value) =>
  value === undefined ||
  typeof value === 'string' ||
  (typeof value === 'number' && Number.isFinite(value));
const validDate = (value) =>
  !value ||
  (/^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value);

/** Validate untrusted persisted/backup DTOs before exposing them to UI code. */
export function isReport(value) {
  if (
    !value ||
    typeof value.title !== 'string' ||
    typeof value.period !== 'string' ||
    !optionalString(value.updatedAt) ||
    !optionalString(value.deletedAt)
  )
    return false;
  if (value.template !== undefined && !['standard', 'retrospective'].includes(value.template))
    return false;
  if (
    value.reviewedRisks !== undefined &&
    (!Array.isArray(value.reviewedRisks) ||
      !value.reviewedRisks.every((key) => typeof key === 'string'))
  )
    return false;
  if (
    value.editorDrafts !== undefined &&
    (!value.editorDrafts ||
      typeof value.editorDrafts !== 'object' ||
      Array.isArray(value.editorDrafts) ||
      !Object.values(value.editorDrafts).every(
        (draft) =>
          draft &&
          typeof draft === 'object' &&
          Object.values(draft).every((field) => typeof field === 'string'),
      ))
  )
    return false;
  if (value.id !== undefined && !isId(value.id)) return false;
  if (![value.cards, value.people, value.sources].every(Array.isArray)) return false;
  if (
    !value.people.every(
      (p) =>
        p &&
        isId(p.id) &&
        typeof p.name === 'string' &&
        Boolean(p.name.trim()) &&
        typeof p.role === 'string',
    )
  )
    return false;
  if (!uniqueIds(value.people)) return false;
  const people = new Set(value.people.map((p) => p.id));
  if (
    !value.cards.every(
      (c) =>
        c &&
        isId(c.id) &&
        CARD_TYPES.includes(c.type) &&
        (c.section === undefined || Object.hasOwn(REPORT_SECTIONS, c.section)) &&
        typeof c.title === 'string' &&
        typeof c.body === 'string' &&
        Array.isArray(c.mentions) &&
        c.mentions.every((id) => isId(id) && people.has(id)) &&
        ['owner', 'due', 'source', 'alt'].every((key) => optionalString(c[key])) &&
        (!c.owner || people.has(c.owner)) &&
        validDate(c.due) &&
        scalar(c.value) &&
        scalar(c.target) &&
        (c.visual === undefined || isVisual(c.visual)) &&
        (c.chartImage === undefined || c.chartImage === '' || isImageData(c.chartImage)) &&
        (c.link === undefined || c.link === '' || safeLink(c.link)) &&
        (c.image === undefined || c.image === '' || isImageData(c.image)),
    )
  )
    return false;
  return (
    uniqueIds(value.cards) &&
    value.sources.every(
      (s) =>
        s &&
        typeof s.name === 'string' &&
        typeof s.detail === 'string' &&
        optionalString(s.original) &&
        (s.fingerprint === undefined || /^[a-f0-9]{64}$/.test(s.fingerprint)),
    )
  );
}
export function isLibrary(value) {
  return (
    Array.isArray(value) &&
    value.every((report) => isReport(report) && isId(report.id)) &&
    uniqueIds(value)
  );
}
