/** A tiny client for DevBoard's own REST API: the MCP tools are a thin, validated layer on top of it. */
export type ApiFn = <T = any>(method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", path: string, body?: unknown) => Promise<T>;

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

export function createHttpApi(baseUrl: string): ApiFn {
  const base = baseUrl.replace(/\/+$/, "");
  return async (method, path, body) => {
    let res: Response;
    try {
      res = await fetch(base + path, {
        method,
        headers: body !== undefined ? { "content-type": "application/json" } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        cache: "no-store",
      });
    } catch (e) {
      throw new ApiError(0, `Cannot reach DevBoard at ${base} (${(e as Error).message}). Is the app running and DEVBOARD_URL correct?`);
    }
    const text = await res.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON body */ }
    if (!res.ok) throw new ApiError(res.status, json?.error ?? `DevBoard API returned HTTP ${res.status}`);
    return json;
  };
}
