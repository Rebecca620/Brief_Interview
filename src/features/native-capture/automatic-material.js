import { profileCollection } from '../../domain/datasets/parse.js';
import { fieldChoices } from '../../domain/datasets/field-choices.js';
import { analyzeDataset } from '../../domain/datasets/analyze.js';
import { recordCards } from '../../domain/datasets/record-cards.js';
import { caseReportFindings } from '../../domain/datasets/case-report.js';
import { buildMaterial } from '../data-import/build-material.js';

/** A conservative automatic path. Ambiguity stays in the existing reviewed import flow. */
export function automaticPlan(dataset) {
  if (dataset.caseReport)
    return {
      findings: caseReportFindings(dataset.caseReport),
      collection: 'case-report',
      config: { mode: 'case-report' },
    };
  if (dataset.collections.length !== 1 || dataset.notices.length) return null;
  const collection = dataset.collections[0];
  if (collection.rows.some((r) => r.type === 'compress')) return null;
  const fields = fieldChoices(collection, profileCollection(collection).fields);
  const metrics = fields.filter((f) => f.recommended && f.numbers && !f.unavailable);
  if (!fields.some((f) => f.numbers || f.numericStrings))
    return {
      findings: recordCards(collection),
      collection: collection.id,
      config: { mode: 'records' },
    };
  if (metrics.length !== 1) return null;
  const groups = fields.filter((f) => f.group && f.id !== metrics[0].id && !f.dates);
  const dates = fields.filter((f) => f.dates);
  if (groups.length > 1 || dates.length > 1) return null;
  const config = {
    mode: 'numeric',
    metric: metrics[0].id,
    group: groups[0]?.id || '',
    date: dates[0]?.id || '',
    numericStrings: false,
  };
  return {
    findings: analyzeDataset(collection, fields, config),
    collection: collection.id,
    config,
  };
}
export async function automaticMaterial(material) {
  const plan = automaticPlan(material.dataset);
  if (!plan) return null;
  return buildMaterial(
    material,
    plan.collection,
    plan.config,
    plan.findings,
    plan.findings.map((_, i) => i),
  );
}
