/** Explicit paragraph/list formatting only; never interprets HTML or invents a takeaway. */
export function reportBodyHTML(text, escape) {
  return String(text || '')
    .split(/\n\s*\n/)
    .filter((part) => part.trim())
    .map((part) => {
      const lines = part.split('\n');
      if (lines.every((line) => /^\s*[-•]\s+/.test(line)))
        return `<ul style="margin:0 0 14px;padding-left:20px;font-size:15px;line-height:1.8">${lines.map((line) => `<li>${escape(line.replace(/^\s*[-•]\s+/, ''))}</li>`).join('')}</ul>`;
      return lines
        .map((line) =>
          /^(结论|建议|共识|Takeaway|Conclusion):|^(结论|建议|共识)：/i.test(line.trim())
            ? `<p style="font-size:15px;line-height:1.75;font-weight:600;border-left:2px solid #b8c5d3;padding-left:12px;margin:16px 0 0">${escape(line)}</p>`
            : `<p style="font-size:15px;line-height:1.8;margin:0 0 8px;color:#424247">${escape(line)}</p>`,
        )
        .join('');
    })
    .join('');
}
