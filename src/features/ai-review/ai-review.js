import { $, modal } from '../../shared/ui.js';
import { escapeHTML as e } from '../../domain/export.js';
import { CATEGORY_LABELS, isReview, reviewInput, suggestedType } from './contract.js';
const findings = {
  decision: 'This may be a decision request. Make the required approval visible.',
  blocker: 'This may be an unresolved blocker. Check what is needed to unblock the work.',
  progress: 'This appears to be a progress update. Check that it needs no further action.',
  mixed: 'This may contain several topics. Consider splitting it into separate updates.',
  unclear: 'There is not enough context to identify an action. Review the original text.',
};
export function createAIReview(ctx) {
  let controller;
  // Only availability is checked automatically. No report content leaves the browser here.
  fetch('/api/ai/status')
    .then((response) => (response.ok ? response.json() : null))
    .then((status) => {
      $('#ai-review-report').hidden = status?.enabled !== true;
    })
    .catch(() => {});
  $('#modal').addEventListener('close', () => controller?.abort());
  function open() {
    const report = ctx.report;
    const cards = report.cards.filter(
      (card) =>
        ['update', 'decision'].includes(card.type) && (card.body.trim() || card.title.trim()),
    );
    if (!cards.length) {
      modal('Check decisions & blockers', '<p>Add a text update first.</p>');
      return;
    }
    controller?.abort();
    controller = new AbortController();
    const snapshots = cards.map((card) => ({ ...card }));
    modal(
      'Check decisions & blockers',
      `<p>Find possible requests or blockers that deserve attention. You review every suggestion before it changes the report.</p>
      <p class="modal-description">Only selected titles and text are sent to TypeSafe AI. Images, original source files, and other reports are excluded. Select up to 10 updates.</p>
      <div class="review-selections">${snapshots.map((card, index) => `<div class="ai-item"><label><input type="checkbox" data-review-select="${index}" ${index < 10 ? 'checked' : ''} /> ${e(card.title)}</label><details><summary>Text to send</summary><p class="original-text">${e(card.body || card.title)}</p></details><div id="ai-result-${index}" class="ai-result"></div></div>`).join('')}</div>
      <p id="ai-status" role="status">No text has been sent.</p><button id="ai-send" class="btn primary">Review selected text</button>`,
    );
    const status = $('#ai-status'),
      send = $('#ai-send');
    send.onclick = async () => {
      const selected = [...document.querySelectorAll('[data-review-select]:checked')].map((input) =>
        Number(input.dataset.reviewSelect),
      );
      if (!selected.length || selected.length > 10) {
        status.textContent = 'Select between 1 and 10 updates.';
        return;
      }
      // Validate the full selection before transmitting any part of it.
      let inputs;
      try {
        inputs = selected.map((index) =>
          reviewInput({
            ...snapshots[index],
            body: snapshots[index].body || snapshots[index].title,
          }),
        );
      } catch (error) {
        status.textContent = error.message;
        return;
      }
      send.disabled = true;
      document.querySelectorAll('[data-review-select]').forEach((input) => {
        input.disabled = true;
      });
      let completed = 0;
      try {
        for (let position = 0; position < selected.length; position++) {
          const index = selected[position],
            result = $(`#ai-result-${index}`);
          status.textContent = `Checking ${position + 1} of ${selected.length}…`;
          result.replaceChildren();
          const response = await fetch('/api/ai/review', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Brief-Review': '1' },
            body: JSON.stringify(inputs[position]),
            signal: controller.signal,
          });
          const review = await response.json();
          if (!response.ok) throw Error(review.error || 'Review unavailable. Try again later.');
          if (!isReview(review)) throw Error('The review response could not be read.');
          if (!result.isConnected) return;
          renderFinding(result, review, snapshots[index], report);
          completed++;
        }
        status.textContent = `Checked ${completed} updates. Your report changes only when you apply a suggestion.`;
      } catch (error) {
        if (status.isConnected && error.name !== 'AbortError')
          status.textContent = `${completed} checked. ${error.message} Your original text is unchanged.`;
      } finally {
        if (send.isConnected) {
          send.disabled = false;
          document.querySelectorAll('[data-review-select]').forEach((input) => {
            input.disabled = false;
          });
        }
      }
    };
  }
  function renderFinding(result, review, snapshot, report) {
    const category = review.category,
      type = suggestedType(review);
    result.innerHTML = `<strong>${e(CATEGORY_LABELS[category.label])}</strong><p>${e(findings[category.label])}</p>
      <details><summary>Model details</summary><p>Model: ${e(review.model)}. Estimates have not been validated as accuracy for your project.</p><dl class="ai-signals"><dt>Purpose probability</dt><dd>${Math.round(category.probabilities[category.label] * 100)}%</dd><dt>Model confidence</dt><dd>${Math.round(category.confidence * 100)}%</dd><dt>Leadership action needed</dt><dd>${Math.round(review.leadershipProbability * 100)}%</dd><dt>Unresolved blocker</dt><dd>${Math.round(review.blockerProbability * 100)}%</dd></dl></details>
      ${type && type !== snapshot.type ? `<button class="btn" data-apply>Move to ${type === 'decision' ? 'Needs a decision' : 'Progress'}</button>` : !type ? '<p>No automatic change is offered. Review the text manually.</p>' : '<p>The current type matches this suggestion.</p>'}`;
    const apply = result.querySelector('[data-apply]');
    if (!apply) return;
    apply.onclick = () => {
      const card = ctx.report?.cards.find((item) => item.id === snapshot.id);
      if (
        ctx.report?.id !== report.id ||
        !card ||
        card.title !== snapshot.title ||
        card.body !== snapshot.body ||
        card.type !== snapshot.type ||
        card.section !== snapshot.section
      ) {
        apply.disabled = true;
        apply.textContent = 'Update changed. Review it again.';
        return;
      }
      card.type = type;
      card.section = type === 'decision' ? 'decision' : 'progress';
      ctx.commit();
      ctx.render();
      apply.disabled = true;
      apply.textContent = 'Suggestion applied';
      const undo = document.createElement('button');
      undo.className = 'btn';
      undo.textContent = 'Undo suggestion';
      result.append(undo);
      undo.onclick = () => {
        if (
          ctx.report?.id !== report.id ||
          !ctx.report.cards.includes(card) ||
          card.type !== type ||
          card.section !== (type === 'decision' ? 'decision' : 'progress')
        ) {
          undo.disabled = true;
          return;
        }
        card.type = snapshot.type;
        if (snapshot.section === undefined) delete card.section;
        else card.section = snapshot.section;
        ctx.commit();
        ctx.render();
        undo.disabled = true;
      };
    };
  }
  return { open };
}
