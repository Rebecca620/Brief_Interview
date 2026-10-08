import { cardSection } from './report.js';
export const RISK_SOURCE = '[Brief risk review]';
const rules = [
  {
    id: 'schedule',
    title: 'Schedule risk signal',
    pattern:
      /\b(delayed|behind schedule|miss(?:ed|ing) (?:the )?deadline|deadline (?:is )?at risk)\b|延期|延误|落后于计划|无法按期|赶不上截止/,
    action: 'Confirm the affected milestone, revised date and impact on dependent work.',
  },
  {
    id: 'dependency',
    title: 'Dependency or approval blocker',
    pattern:
      /\b(blocked|blocker|waiting for approval|approval (?:is )?pending|access approval is pending|dependency (?:is )?unresolved)\b|阻塞|受阻|等待审批|审批未完成|依赖未解决/,
    action: 'Identify the dependency owner, required decision and an unblock date.',
  },
  {
    id: 'resource',
    title: 'Resource constraint',
    pattern:
      /\b(understaffed|staff shortage|capacity shortage|insufficient capacity|resource shortage)\b|人手不足|资源不足|产能不足|人员短缺/,
    action:
      'Confirm the capacity gap and choose between added support, reduced scope or a revised schedule.',
  },
  {
    id: 'budget',
    title: 'Budget risk signal',
    pattern:
      /\b(over budget|budget overrun|cost overrun|funding gap)\b|预算超支|超出预算|资金缺口|成本超支/,
    action:
      'Verify the forecast against the approved budget and identify the approval or corrective action needed.',
  },
  {
    id: 'scope',
    title: 'Scope change signal',
    pattern:
      /\b(scope creep|unapproved scope|requirements keep changing)\b|范围蔓延|需求频繁变更|未经批准的范围/,
    action: 'Confirm the requested change and its effect on scope, cost and delivery dates.',
  },
  {
    id: 'quality',
    title: 'Quality or reliability signal',
    pattern:
      /\b(critical bug|critical defect|data loss|failed acceptance|test failures|production outage)\b|严重缺陷|数据丢失|验收失败|测试失败|生产故障/,
    action:
      'Confirm impact, containment, the remediation owner and the evidence required before release.',
  },
];
const negated =
  /\b(no|not|without|never)\b|\b(?:resolved|fixed|cleared|avoided|prevented)\b|没有|并未|未出现|已解决|已修复|已恢复|无(?:延期|延误|阻塞|资源不足|预算超支|生产故障)/i;
export function localToday(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
export function validReviewDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
/** Conservative signals, not a project health prediction. Source files and images are not scanned. */
export function projectRisks(report, asOf = localToday()) {
  if (!validReviewDate(asOf)) throw Error('Choose a valid review date.');
  const findings = [];
  for (const card of report.cards) {
    if (card.source?.startsWith(RISK_SOURCE)) continue;
    const text = [card.title, card.body].filter(Boolean).join('\n');
    const clauses = [
      ...new Set(
        text
          .split(/[\n.!?。！？;；]+|\bbut\b|但是|但仍/i)
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ];
    for (const rule of rules) {
      const evidence = clauses.find(
        (line) => rule.pattern.test(line.toLowerCase()) && !negated.test(line),
      );
      if (evidence)
        findings.push({
          key: `${card.id}:${rule.id}`,
          cardId: card.id,
          cardTitle: card.title,
          title: rule.title,
          evidence,
          action: rule.action,
          kind: 'signal',
        });
    }
    if (['next', 'decision'].includes(cardSection(card)) && card.due && card.due < asOf) {
      findings.push({
        key: `${card.id}:due`,
        cardId: card.id,
        cardTitle: card.title,
        title: 'Past due date — completion needs checking',
        evidence: `Due date: ${card.due}. Review date: ${asOf}. The card has no completion-status field.`,
        action:
          'Confirm whether this item is complete. If still open, assign an owner and agree on a revised date.',
        kind: 'check',
      });
    }
  }
  return findings.map((f) => ({
    ...f,
    alreadyAdded: report.cards.some((c) => c.source?.startsWith(`${RISK_SOURCE} ${f.key}\n`)),
  }));
}
