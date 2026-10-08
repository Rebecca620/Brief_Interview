/** Presentation only: switching templates never rewrites report content. */
export const retrospectiveSections = {
  progress: { title: '数据与指标 · Evidence & metrics', color: '#087e83' },
  decision: { title: '待对齐决策 · Decisions', color: '#7152a3' },
  discussion: { title: '协作与风险 · Collaboration & risks', color: '#8c6539' },
  next: { title: '下一步行动 · Action plan', color: '#aa4657' },
  consensus: { title: '核心共识 · Key takeaways', color: '#47763a' },
};

export function retrospectiveFragment(report, sections, { escape, cardHTML, ownerName }) {
  const heading = (section) => {
    const { title, color } = retrospectiveSections[section.id];
    return `<h2 style="font-size:22px;font-weight:600;letter-spacing:-0.5px;margin:0 0 8px;padding-left:12px;border-left:2px solid ${color};color:#1d1d1f">${title}</h2>`;
  };
  return `<div class="email-report retrospective" style="max-width:960px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#1d1d1f;background:#fff;padding:24px;line-height:1.6">
    <header style="border-bottom:1px solid #dedee3;padding-bottom:20px;margin-bottom:24px"><h1 style="font-size:36px;font-weight:650;line-height:1.25;letter-spacing:-1px;margin:0 0 12px">${escape(report.title || 'Project retrospective')}</h1><p style="font-size:13px;color:#64646b;margin:0">${escape(report.period)}</p></header>
    ${sections
      .map((section) => {
        // Rich cards retain all their content below the table rather than losing images or charts.
        const actions =
          section.id === 'next'
            ? section.cards.filter((c) => c.type === 'update' && !c.visual && !c.link)
            : [];
        const cards = section.cards.filter((c) => !actions.includes(c));
        const table = actions.length
          ? `<div role="region" aria-label="Action plan" tabindex="0" style="overflow-x:auto"><table style="width:100%;min-width:560px;border-collapse:collapse;font-size:13px;text-align:left"><caption style="text-align:left;color:#64646b;font-size:12px;padding-bottom:8px">责任人与期限 · Owners and deadlines</caption><thead><tr>${['行动项 / Action', '负责人 / Owner', '关键要点 / Details', '期限 / Due'].map((label) => `<th scope="col" style="padding:12px;border-bottom:1px solid #dedee3;background:#f5f5f7">${label}</th>`).join('')}</tr></thead><tbody>${actions.map((c) => `<tr>${[c.title, ownerName(report, c), c.body, c.due || 'Not set'].map((v) => `<td style="padding:12px;border-bottom:1px solid #e8e8ed;vertical-align:top;white-space:pre-wrap;overflow-wrap:anywhere">${escape(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
          : '';
        return `<section style="margin:0 0 40px">${heading(section)}${table}<div style="display:flex;flex-wrap:wrap;gap:28px">${cards.map((c) => `<div class="${section.id === 'consensus' || c.visual || c.type === 'image' ? 'retrospective-wide' : 'retrospective-short'}" style="flex:1 1 ${section.id === 'consensus' || c.visual || c.type === 'image' ? '100%' : '360px'};min-width:0">${cardHTML(report, c, 3)}</div>`).join('')}</div></section>`;
      })
      .join('')}
  </div>`;
}
