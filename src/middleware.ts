import { defineMiddleware } from 'astro:middleware';

const OLD_HOST = 'shield-wizard.genteure.workers.dev';
const NEW_HOST = 'shield-wizard.genteure.com';

export const onRequest = defineMiddleware((context, next) => {
  const host = context.request.headers.get('host');
  if (host === OLD_HOST) {
    const url = new URL(context.request.url);
    url.host = NEW_HOST;
    return new Response(null, {
      status: 301,
      headers: {
        Location: url.toString(),
      },
    });
  }
  return next();
});
