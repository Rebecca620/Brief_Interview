/** Fictional, small datasets for trying the import workflow. */
export function dataExample(mode) {
  if (mode === 'evaluation')
    return new File(
      [
        [
          { model: 'Model A', score: 3 },
          { model: 'Model A', score: 1 },
          { model: 'Model B', score: 2 },
          { model: 'Model B', score: null },
        ]
          .map((row) => JSON.stringify(row))
          .join('\n'),
      ],
      'fictional-evaluation.jsonl',
      { type: 'application/x-ndjson' },
    );
  return new File(
    [
      JSON.stringify(
        {
          records: [
            { date: '2026-09-01', team: 'IT', completed: 20 },
            { date: '2026-09-02', team: 'IT', completed: 28 },
            { date: '2026-09-01', team: 'Operations', completed: 12 },
            { date: '2026-09-02', team: 'Operations', completed: 22 },
            { date: '2026-09-02', team: 'IT', completed: null },
          ],
        },
        null,
        2,
      ),
    ],
    'fictional-project-data.json',
    { type: 'application/json' },
  );
}
