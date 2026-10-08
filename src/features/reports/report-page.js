import { icon } from '../../shared/icons.js';
import { $, toast, modal } from '../../shared/ui.js';
import { escapeHTML as e, cardHTML, reportFragment } from '../../domain/export.js';
import { retrospectiveSections } from '../../domain/report-template.js';
import {
  checks,
  reportSections,
  cardSection,
  REPORT_SECTIONS,
  assignSection,
} from '../../domain/report.js';
import { createCardEditor } from './card-editor.js';
export function createReportPage(ctx) {
  const editor = createCardEditor(ctx);
  const fitTitle = () => {
    const title = $('#report-title');
    if (!title.clientWidth) return;
    title.style.height = 'auto';
    const style = getComputedStyle(title);
    const borders = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
    title.style.height = `${Math.ceil(title.scrollHeight + borders)}px`;
  };
  let titleWidth = -1;
  const titleResize = new ResizeObserver(([entry]) => {
    if (entry.contentRect.width === titleWidth) return;
    titleWidth = entry.contentRect.width;
    fitTitle();
  });
  titleResize.observe($('#report-title'));
  document.fonts.ready.then(fitTitle);
  const editableHTML = (report, card) => {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = cardHTML(report, card, 3);
    const heading = wrapper.querySelector('h3');
    if (heading) {
      heading.contentEditable = 'true';
      heading.classList.add('inline-title');
      heading.setAttribute('aria-label', `Title of ${card.title}`);
      heading.dataset.inlineTitle = card.id;
      heading.spellcheck = true;
    }
    if (['update', 'decision'].includes(card.type) && !card.visual) {
      const paragraph = document.createElement('p');
      paragraph.className = 'inline-body';
      paragraph.contentEditable = 'true';
      paragraph.setAttribute('role', 'textbox');
      paragraph.setAttribute('aria-multiline', 'true');
      paragraph.setAttribute('aria-label', `Details of ${card.title}`);
      paragraph.dataset.inlineBody = card.id;
      paragraph.textContent = card.body;
      paragraph.spellcheck = true;
      const old = wrapper.querySelector('.email-card > p');
      if (old) old.replaceWith(paragraph);
      else heading?.after(paragraph);
    }
    return wrapper.innerHTML;
  };
  function render() {
    const report = ctx.report;
    if (!report) return;
    $('#report-title').value = report.title;
    fitTitle();
    $('#report-heading').setAttribute('aria-label', report.title || 'Untitled report');
    $('#report-period').value = report.period;
    $('#report-template').value = report.template || 'standard';
    const issues = checks(report.cards);
    $('#review-summary').textContent = issues.length
      ? `${issues.length} ${issues.length === 1 ? 'detail' : 'details'} to review below`
      : '';
    $('#review-summary').hidden = !issues.length;
    $('#cards').innerHTML =
      reportSections(report.cards)
        .map(
          (section) =>
            `<section class="report-section"><h2>${report.template === 'retrospective' ? retrospectiveSections[section.id].title : section.title}</h2>${section.cards
              .map(
                (card, index) => `
      <article class="card ${card.type}" aria-label="${e(card.title)}">
      ${editableHTML(report, card)}
      <div class="card-tools"><select aria-label="Report section for ${e(card.title)}" data-quick-section="${card.id}">${Object.entries(
        REPORT_SECTIONS,
      )
        .map(
          ([value, label]) =>
            `<option value="${value}" ${cardSection(card) === value ? 'selected' : ''}>${label}</option>`,
        )
        .join(
          '',
        )}</select><button data-edit="${card.id}" aria-label="Edit ${e(card.title)}">${icon('edit')} Edit</button><details class="card-options"><summary aria-label="Options for ${e(card.title)}">More</summary><div>
      <button data-move="${card.id}" data-dir="-1" ${index === 0 ? 'disabled' : ''} aria-label="Move ${e(card.title)} up">Move up</button><button data-move="${card.id}" data-dir="1" ${index === section.cards.length - 1 ? 'disabled' : ''} aria-label="Move ${e(card.title)} down">Move down</button><button data-card-share="${card.id}" aria-label="Share ${e(card.title)}">Share card</button>
      </div></details></div>
      <div class="card-issues">${issues
        .filter((issue) => issue.id === card.id)
        .map(
          (issue) => `<button data-edit="${card.id}">${e(issue.text)} ${icon('forward')}</button>`,
        )
        .join('')}</div>
      </article>`,
              )
              .join('')}</section>`,
        )
        .join('') || '<p class="empty">Add material on the left or create an update below.</p>';
    $('#source-count').textContent = `${report.sources.length} sources`;
    $('#sources').innerHTML =
      report.sources
        .map(
          (source) =>
            `<details class="source"><summary>${e(source.name)}</summary><p>${e(source.detail)}</p>${source.original !== undefined ? `<details><summary>Original data</summary><pre class="source-detail">${e(source.original)}</pre></details>` : ''}</details>`,
        )
        .join('') +
      report.cards
        .filter((card) => card.source)
        .map(
          (card) =>
            `<details class="source"><summary>Original: ${e(card.title)}</summary><p>${e(card.source)}</p></details>`,
        )
        .join('');
  }
  $('#report-title').oninput = (event) => {
    ctx.report.title = event.target.value;
    fitTitle();
    $('#report-heading').setAttribute('aria-label', ctx.report.title || 'Untitled report');
    document.title = `${ctx.report.title || 'Weekly update'} — Brief`;
    ctx.commit();
  };
  $('#report-template').onchange = (event) => {
    ctx.report.template = event.target.value;
    ctx.commit();
    render();
    toast('Layout updated. Your cards are unchanged.');
  };
  $('#preview-layout').onclick = () => {
    modal(
      'Report layout preview',
      `<p class="field-help">HTML and PDF use this layout. Email apps may stack cards; PNG and slides use their own readable layouts.</p>${reportFragment(ctx.report)}`,
    );
    $('#modal').classList.add('wide');
  };
  $('#report-period').oninput = (event) => {
    ctx.report.period = event.target.value;
    ctx.commit();
  };
  $('#cards').addEventListener('input', (event) => {
    const node = event.target.closest('[data-inline-title],[data-inline-body]');
    if (!node) return;
    const card = ctx.report.cards.find(
      (c) => c.id === (node.dataset.inlineTitle || node.dataset.inlineBody),
    );
    if (node.dataset.inlineTitle) card.title = node.innerText;
    else card.body = node.innerText;
    ctx.commit();
  });
  $('#cards').addEventListener('paste', (event) => {
    if (!event.target.closest('[contenteditable]')) return;
    event.preventDefault();
    const text = event.clipboardData.getData('text/plain');
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    event.target.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  $('#cards').addEventListener('keydown', (event) => {
    if (event.target.dataset.inlineTitle && event.key === 'Enter') {
      event.preventDefault();
      event.target.blur();
    }
  });
  $('#cards').addEventListener('focusout', (event) => {
    if (event.target.matches('[data-inline-title],[data-inline-body]')) {
      ctx.repository.flush();
    }
  });
  $('#cards').onchange = (event) => {
    const id = event.target.dataset.quickSection;
    if (!id) return;
    const card = ctx.report.cards.find((c) => c.id === id);
    assignSection(card, event.target.value);
    ctx.commit();
    render();
    document.querySelector(`[data-quick-section="${id}"]`)?.focus();
  };
  $('#cards').onclick = (event) => {
    const move = event.target.closest('[data-move]');
    if (move) {
      const cards = ctx.report.cards,
        index = cards.findIndex((card) => card.id === move.dataset.move);
      const siblings = cards.filter((card) => cardSection(card) === cardSection(cards[index]));
      const nextCard = siblings[siblings.indexOf(cards[index]) + Number(move.dataset.dir)];
      if (!nextCard) return;
      const next = cards.indexOf(nextCard);
      [cards[index], cards[next]] = [cards[next], cards[index]];
      ctx.commit();
      render();
      document.querySelector(`[data-edit="${move.dataset.move}"]`)?.focus();
      toast('Order updated within this section');
      return;
    }
    const share = event.target.closest('[data-card-share]');
    if (share) {
      ctx.shareCard(share.dataset.cardShare);
      return;
    }
    const edit = event.target.closest('[data-edit]');
    if (edit) editor.editCard(edit.dataset.edit);
  };
  return { render, editCard: editor.editCard };
}
