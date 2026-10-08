import { emptyReport, createCard } from '../../domain/report.js';
import { noteCards } from './material-reader.js';
export const exampleNotes = `Progress: The pilot is live. Feedback from the first group is positive.

Needs a decision: VPN access approval. Approval is pending before the next rollout.

Next steps: Complete the rollout. Roll out to the remaining 20 devices once access is approved.`;
export function exampleReport() {
  return {
    ...emptyReport('Weekly update'),
    cards: [
      createCard('metric', { title: 'Devices deployed', value: 80, target: 100 }),
      ...noteCards(exampleNotes, 'Pasted notes', true),
    ],
  };
}
