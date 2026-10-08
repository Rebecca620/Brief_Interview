import { $, modal, toast } from '../../shared/ui.js';
import { escapeHTML as e } from '../../domain/export.js';
import { createCard } from '../../domain/report.js';
import { projectRisks, localToday, RISK_SOURCE } from '../../domain/risk-review.js';
export function createRiskReview(ctx) {
  function open() {
    const report = ctx.report;
    if (!report) return;
    modal(
      'Review project risks',
      `<p>Review possible blockers and overdue work. These suggestions use local rules; confirm them against your project.</p><label for="risk-date">Review date</label><input type="date" id="risk-date" value="${localToday()}"/><button class="btn" id="risk-rescan">Check again</button><p id="risk-status" role="status"></p><div id="risk-findings"></div><div class="modal-actions"><button class="btn" id="risk-undo" hidden>Undo added risk cards</button><button class="btn primary" id="risk-add">Add selected risk cards</button></div>`,
    );
    let findings = [],
      lastAdded = [];
    function scan() {
      try {
        findings = projectRisks(report, $('#risk-date').value).filter(
          (f) => !report.reviewedRisks?.includes(f.key),
        );
        $('#risk-status').textContent = findings.length
          ? `${findings.length} ${findings.length === 1 ? 'item' : 'items'} to review. Update the source or add a separate discussion item.`
          : 'No supported risk signals found. This does not mean the project is risk-free; review missing context and unreported issues.';
        $('#risk-findings').innerHTML = findings
          .map(
            (f, i) =>
              `<article class="data-finding"><label><input type="checkbox" data-risk="${i}" ${f.alreadyAdded ? 'disabled' : ''}/> ${e(f.title)}${f.alreadyAdded ? ' · Already added' : ''}</label><p><strong>From:</strong> ${e(f.cardTitle)}</p>${f.evidence !== f.cardTitle ? `<blockquote>${e(f.evidence)}</blockquote>` : ''}<p><strong>Suggested follow-up:</strong> ${e(f.action)}</p><div class="risk-actions"><button class="btn" data-resolve-risk="${e(f.cardId)}">Update owner & deadline</button><button class="text-button" data-reviewed-risk="${e(f.key)}">Mark reviewed</button></div></article>`,
          )
          .join('');
        $('#risk-add').disabled = !document.querySelector('[data-risk]:checked');
      } catch (error) {
        findings = [];
        $('#risk-findings').innerHTML = '';
        $('#risk-add').disabled = true;
        $('#risk-status').textContent = error.message;
      }
    }
    $('#risk-findings').onclick = (event) => {
      const resolve = event.target.closest('[data-resolve-risk]');
      const reviewed = event.target.closest('[data-reviewed-risk]');
      if (resolve) ctx.reportPage.editCard(resolve.dataset.resolveRisk);
      if (reviewed) {
        report.reviewedRisks ||= [];
        report.reviewedRisks.push(reviewed.dataset.reviewedRisk);
        ctx.commit();
        scan();
        toast('Marked as reviewed. Use Undo to reverse.');
      }
    };
    $('#risk-rescan').onclick = scan;
    $('#risk-date').onchange = scan;
    $('#risk-findings').onchange = () => {
      $('#risk-add').disabled = !document.querySelector('[data-risk]:checked');
    };
    $('#risk-add').onclick = () => {
      const selected = [...document.querySelectorAll('[data-risk]:checked')]
        .map((input) => findings[Number(input.dataset.risk)])
        .filter((f) => !f.alreadyAdded);
      if (!selected.length) {
        $('#risk-status').textContent = 'Select at least one risk signal to add.';
        return;
      }
      const cards = selected.map((f) =>
        createCard('update', {
          title: f.title,
          section: 'discussion',
          body: `For review: ${f.evidence}\n\nSuggested follow-up: ${f.action}`,
          source: `${RISK_SOURCE} ${f.key}\nReviewed ${$('#risk-date').value}. Source card: ${f.cardTitle} (${f.cardId}).\n${f.evidence}\nRule-based signal, not a confirmed risk or AI prediction.`,
        }),
      );
      report.cards.push(...cards);
      lastAdded.push(...cards.map((c) => c.id));
      ctx.commit();
      ctx.render();
      scan();
      $('#risk-undo').hidden = false;
      toast('Selected risk cards added to Needs discussion');
    };
    $('#risk-undo').onclick = () => {
      report.cards = report.cards.filter((c) => !lastAdded.includes(c.id));
      lastAdded = [];
      ctx.commit();
      ctx.render();
      scan();
      $('#risk-undo').hidden = true;
      toast('Added risk cards removed');
    };
    scan();
  }
  return { open };
}
