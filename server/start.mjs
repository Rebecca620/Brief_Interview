import { createBriefServer } from './app.mjs';
const port = Number(process.env.PORT || 4174);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw Error('PORT must be between 1024 and 65535.');
const enabled = Boolean(process.env.TYPESAFE_API_KEY);
createBriefServer({
  apiKey: process.env.TYPESAFE_API_KEY,
  model: process.env.TYPESAFE_MODEL,
}).listen(port, '127.0.0.1', () => {
  console.log(`Brief: http://127.0.0.1:${port}`);
  console.log(
    enabled
      ? 'Optional Jev review is configured. Text is sent only after an explicit request.'
      : 'Jev is not configured. All local reporting features remain available.',
  );
});
