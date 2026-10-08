import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { emptyReport, createCard, isReport } from '../../src/domain/report.js';
import { backupDTO } from '../../src/data/report-repository.js';
import { reportHTML } from '../../src/domain/export.js';

export async function buildTestKit(root = '.build/brief-test-kit') {
  for (const folder of ['valid', 'invalid', 'reference'])
    await mkdir(`${root}/${folder}`, { recursive: true });
  const put = (file, value) =>
    writeFile(
      `${root}/${file}`,
      typeof value === 'string' ? value : JSON.stringify(value, null, 2),
    );
  const rows = [0, 10, 20, 30, 40, 50, 60, 150, null, 'not measured'].map((value, i) => ({
    date: `2026-09-${String(14 + Math.floor(i / 2)).padStart(2, '0')}`,
    team: i % 2 ? 'Operations' : 'IT',
    completed: value,
    constant_zero: 0,
    debug_id: 1000 + i,
  }));
  const pairs = [
    [1, 1],
    [1, 3],
    [1, 3],
    [3, 1],
    [3, 3],
    [3, 3],
  ].flatMap(([a, b], i) => [
    { case_id: `case-${i + 1}`, model: 'Baseline', score: a },
    { case_id: `case-${i + 1}`, model: 'Candidate', score: b },
  ]);
  await put(
    'valid/01-project-notes.txt',
    'Progress: 设备试点已覆盖 80 位同事，共 100 位。Pilot is ready.\n\nNeeds a decision: Approval is pending for the VPN rollout. 请确认责任人与期限。\n\nNeeds discussion: 人手不足，需要协调测试支持。\n\nNext steps: 完成剩余 20 台设备的部署，并收集反馈。',
  );
  await put(
    'valid/02-meeting-notes.md',
    '# Progress: 本周试点复盘\n新增 12 位参与者。\n\n## Needs discussion: 指标口径\n平均处理时间下降可能来自样本构成变化，需要核对。\n\n## Next steps: 核对样本\n请业务负责人确认删除样本的依据。',
  );
  await put(
    'valid/03-metrics.csv',
    'title,value,target\nDevices ready,80,100\nOpen incidents,0,10\n"Pilot, phase two",25,50\n',
  );
  await put('valid/04-project-data.json', { records: rows });
  await put('valid/05-numeric-strings.json', [
    { team: 'IT', value: '0' },
    { team: 'IT', value: '10' },
    { team: 'Ops', value: '20' },
    { team: 'Ops', value: null },
  ]);
  await put('valid/06-paired-models.json', pairs);
  await put(
    'valid/07-evaluations.jsonl',
    [
      { model: 'A', score: 3 },
      { model: 'A', score: 1 },
      { model: 'B', score: 3 },
      { model: 'B', score: null },
    ]
      .map(JSON.stringify)
      .join('\n'),
  );
  await put('valid/08-text-evidence.json', {
    evidence: [
      { title: 'Metric definition', quote: 'The sample changed in week 35.', owner: 'Team A' },
      { title: 'Coordination', quote: 'Approval is pending.', owner: 'Team B' },
    ],
  });
  await put('valid/09-collections.json', {
    evidence: [{ note: 'This is a text record.' }],
    metrics: rows,
  });
  await put(
    'valid/10-compress.jsonl',
    JSON.stringify({
      type: 'compress',
      id: 'fictional-1',
      dialog: [
        { role: 'user', content: 'How is the pilot?' },
        {
          role: 'assistant',
          turn_index: 1,
          content: 'GT must not count as a candidate',
          evaluate: { Baseline: { score: 1 }, Candidate: { score: 3 } },
        },
        { role: 'assistant', turn_index: 2, loss: false, evaluate: { Baseline: { score: 3 } } },
      ],
    }),
  );
  await put('valid/11-case-review.json', {
    detection: {
      is_badcase: true,
      observed_behavior: 'Fictional assistant omitted confirmation.',
      uncertainty: ['One case cannot establish population accuracy.'],
    },
    case_review: { case_locator: 'fictional-case-01' },
    retry_root_cause_analysis: {
      available: true,
      trials_total: 99,
      correct_count: 99,
      trial_assessments: [
        { is_correct: true },
        { is_correct: true },
        { is_correct: false },
        { note: 'unscored' },
      ],
    },
    score_summary: { available: false, count: 0 },
    diagnosis: {
      primary_cause: 'Unverified source hypothesis',
      recommendations: [
        {
          title: 'Review the confirmation step',
          rationale: 'Verify against original evidence before changing behavior.',
        },
      ],
    },
  });
  await put(
    'valid/12-table-and-link.html',
    '<!doctype html><meta charset="utf-8"><h1>试点记录</h1><p>Fictional evidence only.</p><table><caption>Device readiness</caption><tr><th>Team</th><th>Ready</th></tr><tr><td>IT</td><td>80</td></tr><tr><td>Operations</td><td>20</td></tr></table><h2>Related report</h2><p><a href="https://example.com/report">Open the fictional report reference</a></p>',
  );
  await put(
    'valid/13-risk-notes.txt',
    'Progress: The rollout is delayed.\n\nNeeds discussion: Approval is pending.\n\nNeeds discussion: 人手不足。\n\nProgress: No resource shortage.\n\nProgress: The issue is resolved.\n\nNext steps: Confirm completion of the old action.',
  );
  await put('valid/14-all-zero.json', [
    { team: 'A', value: 0 },
    { team: 'B', value: 0 },
  ]);
  await put(
    'valid/15-unsafe-markup.html',
    '<!doctype html><h1>Safe visible title</h1><p>&lt;script&gt;literal text&lt;/script&gt;</p><script>window.__briefUnsafeExecuted = true</script><iframe src="https://example.invalid/blocked"></iframe><img src="https://example.invalid/tracker" onerror="window.__briefUnsafeExecuted=true"><p><a href="javascript:alert(1)">Unsafe link text</a></p><table><tr><th>Value</th></tr><tr><td>0</td></tr></table>',
  );
  await put('invalid/01-broken.json', '{"records": [{"value": 1},]}');
  await put('invalid/02-broken-line-3.jsonl', '{"score":3}\n\n{"score":}\n{"score":1}');
  await put('invalid/03-mixed-array.json', [{ value: 1 }, 4]);
  await put('invalid/04-empty.json', '');
  await put('invalid/05-zero-target.csv', 'title,value,target\nInvalid target,0,0');
  await put('invalid/06-missing-columns.csv', 'title,value\nReady,80');
  await put('invalid/07-duplicate-pairs.json', [...pairs, pairs[0]]);
  await put('invalid/08-no-common-pairs.json', [
    { case_id: 'a', model: 'Baseline', score: 1 },
    { case_id: 'b', model: 'Candidate', score: 3 },
  ]);
  await put(
    'invalid/09-merged-table.html',
    '<table><tr><th>A</th><th>B</th></tr><tr><td colspan="2">Merged</td></tr></table>',
  );
  await put(
    'invalid/10-corrupt.docx',
    'Intentionally invalid ZIP bytes, not a real Word document.',
  );
  await put('invalid/11-legacy.doc', 'Intentionally unsupported legacy extension.');
  await put('invalid/12-corrupt.pdf', '%PDF-1.7\nintentionally incomplete');
  await put('invalid/13-too-large.txt', 'x'.repeat(2 * 1024 * 1024 + 1));
  await put(
    'invalid/14-too-many-records.json',
    Array.from({ length: 10001 }, (_, value) => ({ value })),
  );
  await put('invalid/15-backup-version.json', {
    format: 'brief-library',
    version: 999,
    reports: [],
  });
  await put('invalid/16-fake-image.png', 'Intentionally not PNG image bytes.');
  await put('invalid/17-unsupported.xlsx', 'Intentionally unsupported format, not a workbook.');
  await put(
    'invalid/18-bad-turn-index.jsonl',
    JSON.stringify({
      type: 'compress',
      dialog: [
        { role: 'user' },
        { role: 'assistant', turn_index: 99, evaluate: { A: { score: 1 }, B: { score: 3 } } },
      ],
    }),
  );
  await put('invalid/19-unclosed-quote.csv', 'title,value,target\n"Pilot,20,100');
  const report = emptyReport(
    'Critical Case 项目复盘与策略对齐',
    '虚构演示 · 2026 年 9 月 · 聚焦证据、协作风险与下一步行动',
  );
  report.template = 'retrospective';
  report.people = [
    { id: 'person-a', name: '林晨', role: 'Project lead' },
    { id: 'person-b', name: '周宁', role: 'Operations' },
  ];
  const card = (section, title, body, extra = {}) =>
    createCard('update', {
      section,
      title,
      body,
      source: 'Fictional test scenario. Not real enterprise data.',
      ...extra,
    });
  report.cards = [
    card(
      'progress',
      '处理时间下降的原因需要核对',
      '本周平均处理时间由 12 小时降至 9 小时。\n同期移除了 20 条历史案例，样本构成发生变化。\n结论：暂不能把全部下降归因于工作效率提升。',
    ),
    card(
      'progress',
      '成本指标与体验指标分开呈现',
      'Repeated Contact 可用于估算重复服务成本。\n响应时间与满意度反映体验，不直接等于财务收益。\n结论：先统一指标定义，再解释业务价值。',
    ),
    card('progress', '试点部署完成度', '80 / 100 台设备已完成，剩余 20 台待确认窗口。', {
      type: 'metric',
      value: 80,
      target: 100,
    }),
    card('progress', '本周部署趋势', '图表保留实际观测到的零值；不填补缺失值。', {
      visual: {
        kind: 'line',
        title: 'Daily completed devices',
        caption: 'Fictional data · daily counts, not a forecast.',
        columns: ['UTC date', 'Completed'],
        rows: [
          ['2026-09-14', 0],
          ['2026-09-15', 10],
          ['2026-09-16', 20],
          ['2026-09-17', 30],
        ],
      },
    }),
    card(
      'decision',
      '确认对外使用的指标口径',
      '是否采用相同案例范围比较两周表现？请在发布报告前确认。',
      { type: 'decision', owner: 'person-a', due: '2026-10-02' },
    ),
    card(
      'discussion',
      '变更通知尚未同步',
      'Approval is pending for the rollout.\n业务方尚未收到样本范围变更说明。\n建议：项目负责人统一发送变更记录并核对接收人。',
    ),
    card(
      'discussion',
      '测试资源不足',
      '人手不足，剩余 20 台设备的测试窗口需要协调。\n建议：在扩大部署前确认支持人员与回退安排。',
    ),
    card('next', '核对样本变更', '核对两周案例范围，并在报告中标注排除规则。', {
      owner: 'person-a',
      due: '2026-10-01',
    }),
    card('next', '组织指标口径对齐', '确认指标定义、证据来源与汇报责任。', {
      owner: 'person-b',
      due: '2026-10-02',
    }),
    card(
      'consensus',
      '先对齐证据，再确认结论',
      '保留样本变化说明；将已知事实、待确认假设与下一步行动分开。所有内容均为测试示例。',
    ),
  ];
  report.sources = [
    {
      name: 'Fictional reference scenario',
      detail: 'Structure inspired by the user-provided reference image. All content is synthetic.',
    },
  ];
  if (!isReport(report)) throw Error('Invalid reference report');
  await put('reference/01-retrospective-backup.json', backupDTO([report]));
  await put('reference/02-retrospective-preview.html', reportHTML(report));
  await put(
    'reference/03-risk-completion-backup.json',
    backupDTO([
      {
        ...emptyReport('风险与完成情况检查', '固定复核日期 2026-09-26'),
        cards: [
          card('next', '确认旧行动是否已完成', '期限经过不代表未完成。', { due: '2026-09-20' }),
          card('next', '未来行动', '未来期限，不应命中完成检查。', { due: '2026-10-02' }),
        ],
      },
    ]),
  );
  await copyFile('docs/testing/MANUAL-TEST-PLAN.zh-CN.md', `${root}/START-HERE.zh-CN.md`);
  return root;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  console.log(await buildTestKit(process.argv[2]));
