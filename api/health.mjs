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

export default {
  async fetch(request) {
    if (request.method !== 'GET') {
      return jsonResponse(405, {
        success: false,
        error: 'Method not allowed.'
      });
    }

    try {
      const upstreamResponse = await fetch(backendUrl('/api/health'), {
        headers: {
          accept: 'application/json'
        }
      });

      return new Response(upstreamResponse.body, {
        status: upstreamResponse.status,
        headers: {
          'content-type': upstreamResponse.headers.get('content-type') || 'application/json'
        }
      });
    } catch (error) {
      return jsonResponse(502, {
        success: false,
        error: error.message || 'Backend health check failed.'
      });
    }
  }
};
