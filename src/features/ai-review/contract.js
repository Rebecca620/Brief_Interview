/** DTO shared by the UI and server. It deliberately excludes sources, people and assets. */
export const CATEGORY_LABELS = {
  progress: 'Progress update',
  decision: 'Decision requested',
  blocker: 'Unresolved blocker',
  mixed: 'Several topics',
  unclear: 'Not enough context',
};
export const REVIEW_LIMIT = 8000;
export const REVIEW_POLICY = { minConfidence: 0.8, minProbability: 0.8 };
export function reviewInput(card) {
  if (typeof card?.title !== 'string' || typeof card?.body !== 'string')
    throw Error('Choose a text card to review.');
  if (card.title.length > 180 || card.body.length > REVIEW_LIMIT)
    throw Error(`Use a title below 181 characters and card text up to ${REVIEW_LIMIT} characters.`);
  if (!card.body.trim()) throw Error('Add some project text before requesting a review.');
  return { title: card.title, body: card.body };
}
const probability = (value) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
export function isReview(value) {
  const category = value?.category;
  const options = Object.keys(CATEGORY_LABELS);
  return Boolean(
    value &&
    typeof value.model === 'string' &&
    value.model.length <= 100 &&
    value.promptVersion === 'brief-review-v1' &&
    category &&
    options.includes(category.label) &&
    probability(category.confidence) &&
    category.probabilities &&
    typeof category.probabilities === 'object' &&
    Object.keys(category.probabilities).length === options.length &&
    options.every((option) => probability(category.probabilities[option])) &&
    Math.abs(options.reduce((sum, option) => sum + category.probabilities[option], 0) - 1) <
      0.001 &&
    options.every(
      (option) => category.probabilities[category.label] >= category.probabilities[option],
    ) &&
    probability(value.leadershipProbability) &&
    probability(value.blockerProbability),
  );
}
/** These starting thresholds are a UI policy, not measured accuracy guarantees. */
export function suggestedType(review) {
  if (!isReview(review)) return null;
  const category = review.category;
  if (
    category.confidence < REVIEW_POLICY.minConfidence ||
    category.probabilities[category.label] < REVIEW_POLICY.minProbability
  )
    return null;
  return { progress: 'update', decision: 'decision' }[category.label] || null;
}
