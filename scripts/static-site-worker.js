function acceptsHtml(request) {
  return request.headers.get('accept')?.includes('text/html') ?? false
}

function looksLikeFile(pathname) {
  return pathname.split('/').at(-1)?.includes('.') ?? false
}

/**
 * Cloudflare Sites worker source emitted alongside the browser bundle.
 *
 * Keeping this source tracked makes `npm run build` reproducible in a clean
 * checkout instead of depending on a machine-local deployment helper.
 */
export default {
  async fetch(request, environment) {
    if (!environment?.ASSETS?.fetch) {
      return new Response('Static asset binding is unavailable.', { status: 500 })
    }

    const response = await environment.ASSETS.fetch(request)
    if (response.status !== 404 || request.method !== 'GET') return response

    const url = new URL(request.url)
    if (!acceptsHtml(request) && looksLikeFile(url.pathname)) return response

    url.pathname = '/index.html'
    return environment.ASSETS.fetch(new Request(url, {
      headers: request.headers,
      method: 'GET',
    }))
  },
}
