import { $, modal, download } from '../../shared/ui.js';
import { escapeHTML as e, cardText } from '../../domain/export.js';
import { cardSection } from '../../domain/report.js';
import { calendarFile } from '../../domain/calendar.js';
export function openMeeting(report, cards = report.cards) {
  const discussion = cards.filter((c) => ['decision', 'discussion'].includes(cardSection(c)));
  const agenda = (discussion.length ? discussion : cards)
    .map((card) => cardText(report, card))
    .join('\n\n');
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  modal(
    'Create a meeting draft',
    `<p>Turn this update’s discussion items into an agenda. Times use your device’s timezone (${e(zone)}). Open the calendar file in your calendar app, then add attendees and send the invitation there.</p><form id="meeting-form"><label for="meeting-title">Meeting title</label><input id="meeting-title" required maxlength="180" value="${e(report.title)} — review"/><div class="form-grid"><label>Start<input id="meeting-start" required type="datetime-local"/></label><label>End<input id="meeting-end" required type="datetime-local"/></label></div><label for="meeting-location">Location or meeting link</label><input id="meeting-location"/><label for="meeting-agenda">Agenda</label><textarea id="meeting-agenda" rows="7">${e(agenda)}</textarea><p id="meeting-error" class="form-error" role="alert" hidden></p><button class="btn primary" type="submit">Download calendar draft (.ics)</button><p class="field-help">Nothing is scheduled or sent by Brief. Calendar-file opening depends on your device and browser.</p></form>`,
  );
  $('#meeting-form').onsubmit = (event) => {
    event.preventDefault();
    try {
      const data = calendarFile({
        title: $('#meeting-title').value,
        description: $('#meeting-agenda').value,
        location: $('#meeting-location').value,
        start: $('#meeting-start').value,
        end: $('#meeting-end').value,
      });
      download('brief-meeting.ics', 'text/calendar;charset=utf-8', data);
      $('#meeting-error').hidden = true;
    } catch (error) {
      $('#meeting-error').hidden = false;
      $('#meeting-error').textContent = error.message;
    }
  };
}
