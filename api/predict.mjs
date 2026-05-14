const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'content-encoding',
  'content-length',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade'
]);

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json'
    }
  });
}

function backendUrl(path) {
  const baseUrl = process.env.BACKEND_URL || process.env.AGRI_VISION_BACKEND_URL;

  if (!baseUrl) {
    throw new Error('BACKEND_URL is not configured in Vercel.');
  }

  return new URL(path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).toString();
}

function proxyHeaders(request) {
  const headers = new Headers(request.headers);

  for (const header of HOP_BY_HOP_HEADERS) {
    headers.delete(header);
  }

  return headers;
}

function responseHeaders(upstreamResponse) {
  const headers = new Headers(upstreamResponse.headers);

  for (const header of HOP_BY_HOP_HEADERS) {
    headers.delete(header);
  }

  return headers;
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204
      });
    }

    if (request.method !== 'POST') {
      return jsonResponse(405, {
        success: false,
        error: 'Method not allowed.'
      });
    }

    try {
      const upstreamResponse = await fetch(backendUrl('/api/predict'), {
        method: 'POST',
        headers: proxyHeaders(request),
        body: request.body,
        duplex: 'half'
      });

      return new Response(upstreamResponse.body, {
        status: upstreamResponse.status,
        headers: responseHeaders(upstreamResponse)
      });
    } catch (error) {
      return jsonResponse(502, {
        success: false,
        error: error.message || 'Backend proxy request failed.'
      });
    }
  }
};
