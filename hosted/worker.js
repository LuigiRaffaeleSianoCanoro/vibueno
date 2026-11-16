import { BUNDLED_TEMPLATES, BUILD_SHA, BUILD_VERSION_OK } from './bundled-templates.mjs';
import { templateNameForPath } from './routes.mjs';
import { versionPayloadFromMeta } from './version.mjs';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export function versionPayload() {
  return versionPayloadFromMeta(BUILD_SHA, BUILD_VERSION_OK);
}

export function apiVersion() {
  const payload = versionPayload();
  return json(payload, payload.ok ? 200 : 503);
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

function responseWithoutBody(response) {
  return new Response(null, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

async function handleFetch(request, env) {
  const url = new URL(request.url);
  const { pathname } = url;
  const method = request.method.toUpperCase();

  if (pathname === '/api/version' && (method === 'GET' || method === 'HEAD')) {
    const res = apiVersion();
    return method === 'HEAD' ? responseWithoutBody(res) : res;
  }

  if (method === 'GET' || method === 'HEAD') {
    const name = templateNameForPath(pathname);
    if (name) {
      const res = serveTemplate(name);
      return method === 'HEAD' ? responseWithoutBody(res) : res;
    }
  }

  if (env?.ASSETS) {
    const assetRes = await env.ASSETS.fetch(request);
    if (assetRes.status !== 404) return assetRes;
  }

  return new Response('Not Found', { status: 404 });
}

export default {
  fetch(request, env, _ctx) {
    return handleFetch(request, env);
  },
};