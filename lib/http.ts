/**
 * Läs ett fetch-svar som JSON utan att krascha på icke-JSON-body.
 *
 * I WebKit/Safari (och Capacitor iOS WKWebView) kastar `response.json()` det
 * kryptiska `SyntaxError: The string did not match the expected pattern.` när
 * body inte är giltig JSON — t.ex. en HTML-felsida eller tom body vid 413
 * (för stor request), 504 (timeout) eller en redirect. Använd den här istället
 * för `response.json()` och hantera `null` som "servern svarade inte med JSON".
 */
export async function readJsonSafe<T = unknown>(response: Response): Promise<T | null> {
  try {
    // Läs via text() så en icke-JSON-body (HTML-felsida/tom body) inte kan kasta
    // det kryptiska WebKit-felet från response.json(). Ett riktigt Response-objekt
    // har alltid text(); fallbacken finns för Response-lika mockar utan text().
    if (typeof response.text === 'function') {
      const text = await response.text().catch(() => '')
      if (!text) return null
      try {
        return JSON.parse(text) as T
      } catch {
        return null
      }
    }
    return ((await response.json()) as T) ?? null
  } catch {
    return null
  }
}
