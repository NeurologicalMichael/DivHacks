/** On the published site, read the bundled filings. Locally, call the Next.js server. */
export function apiFetch(input: string, init?: RequestInit) {
  if (process.env.NEXT_PUBLIC_STATIC !== "1") return fetch(input, init);
  return import("./staticFetch").then((mod) => mod.staticFetch(input, init));
}
