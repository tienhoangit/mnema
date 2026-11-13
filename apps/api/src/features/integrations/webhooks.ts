import { Hono } from 'hono';
import { Bindings } from '../../types';
import telegramWebhookRouter, { processTelegramMessage, handleTelegramUpdate } from './telegramWebhook';
import newsletterWebhookRouter, { ingestNewsletterPayload } from './newsletterWebhook';

const app = new Hono<{ Bindings: Bindings }>();

app.route('/telegram', telegramWebhookRouter);
app.route('/newsletter', newsletterWebhookRouter);

export { ingestNewsletterPayload, processTelegramMessage, handleTelegramUpdate };
export default app;
