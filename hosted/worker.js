import { BUNDLED_TEMPLATES, BUILD_SHA } from './bundled-templates.mjs';
import { templateNameForPath } from './routes.mjs';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export function apiVersion() {
  return json({ ok: true, sha: BUILD_SHA || 'unknown' });
}

function serveTemplate(name) {
  const html = BUNDLED_TEMPLATES?.[name];
  if (!html) {
    return json({ ok: false, error: 'template_missing', name }, 503);
  }
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  });
}

async function handleFetch(request) {
  const url = new URL(request.url);
  const { pathname } = url;

  if (request.method === 'GET' && pathname === '/api/version') {
    return apiVersion();
  }

  if (request.method === 'GET') {
    const name = templateNameForPath(pathname);
    if (name) return serveTemplate(name);
  }

  return new Response('Not Found', { status: 404 });
}

export default {
  fetch(request, _env, _ctx) {
    return handleFetch(request);
  },
};