export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

const SESSION_COOKIE_NAME =
  /^(?:__Secure-)?next-auth\.session-token(?:\.\d+)?$/;

export function sessionOnlyCookie(cookie: string): string {
  const [pair, ...attributes] = cookie.split(";");
  const separator = pair.indexOf("=");
  const name = pair.slice(0, separator).trim();
  const value = pair.slice(separator + 1);

  if (!SESSION_COOKIE_NAME.test(name) || !value) return cookie;

  const deletion = attributes.some((attribute) => {
    const [key, attributeValue] = attribute.trim().split("=");
    return key.toLowerCase() === "max-age" && Number(attributeValue) <= 0;
  });
  if (deletion) return cookie;

  return [
    pair,
    ...attributes.filter(
      (attribute) => !/^\s*(?:expires|max-age)\s*=/i.test(attribute),
    ),
  ].join(";");
}

export function applySessionCookiePolicy(
  response: Response,
  remember: boolean,
): Response {
  if (remember) return response;

  const cookies = response.headers.getSetCookie();
  if (!cookies.length) return response;

  const headers = new Headers(response.headers);
  headers.delete("set-cookie");
  for (const cookie of cookies) {
    headers.append("set-cookie", sessionOnlyCookie(cookie));
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
