const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers }
  });

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin"
  };
}

async function makeToken(password) {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const payload = btoa(String.fromCharCode(...bytes));
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(password), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const signature = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return `${payload}.${signature}`;
}

async function validToken(request, password) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(password), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
  );
  try {
    const raw = Uint8Array.from(atob(signature), c => c.charCodeAt(0));
    return await crypto.subtle.verify("HMAC", key, raw, new TextEncoder().encode(payload));
  } catch {
    return false;
  }
}

function safeKey(value) {
  return String(value || "").replace(/[^a-zA-Z0-9._/-]/g, "").replace(/\.\./g, "");
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request);
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === "/api/health") {
        const db = await env.DB.prepare("SELECT 1 AS ok").first();
        return json({ app: "STELLARIX", database: db?.ok === 1, storage: !!env.MEDIA }, 200, cors);
      }

      if (path === "/api/login" && request.method === "POST") {
        if (!env.ADMIN_PASSWORD) return json({ error: "Admin password secret is not configured." }, 500, cors);
        const body = await request.json();
        if (typeof body.password !== "string" || body.password !== env.ADMIN_PASSWORD) {
          return json({ error: "Incorrect password." }, 401, cors);
        }
        return json({ token: await makeToken(env.ADMIN_PASSWORD) }, 200, cors);
      }

      if (path === "/api/anime" && request.method === "GET") {
        const { results } = await env.DB.prepare(
          "SELECT id, title, description, type, poster_key, banner_key, trailer_key, release_year, status FROM anime WHERE status = 'published' ORDER BY created_at DESC"
        ).all();
        return json(results, 200, cors);
      }

      if (path.startsWith("/api/media/") && request.method === "GET") {
        const key = safeKey(decodeURIComponent(path.slice("/api/media/".length)));
        if (!key) return json({ error: "Missing media key." }, 400, cors);
        const object = await env.MEDIA.get(key);
        if (!object) return json({ error: "Media not found." }, 404, cors);
        const headers = new Headers(cors);
        object.writeHttpMetadata(headers);
        headers.set("ETag", object.httpEtag);
        headers.set("Cache-Control", "public, max-age=3600");
        return new Response(object.body, { headers });
      }

      if (path === "/api/admin/anime" && request.method === "POST") {
        if (!env.ADMIN_PASSWORD || !(await validToken(request, env.ADMIN_PASSWORD))) {
          return json({ error: "Sign in as admin first." }, 401, cors);
        }
        const body = await request.json();
        if (!body.title || !["movie", "series"].includes(body.type)) {
          return json({ error: "A title and type (movie or series) are required." }, 400, cors);
        }
        const result = await env.DB.prepare(
          "INSERT INTO anime (title, description, type, poster_key, banner_key, trailer_key, release_year, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        ).bind(
          body.title, body.description || "", body.type,
          body.poster_key || null, body.banner_key || null, body.trailer_key || null,
          body.release_year || null, body.status === "published" ? "published" : "draft"
        ).run();
        return json({ success: true, id: result.meta.last_row_id }, 201, cors);
      }

      if (path.startsWith("/api/admin/media/") && request.method === "PUT") {
        if (!env.ADMIN_PASSWORD || !(await validToken(request, env.ADMIN_PASSWORD))) {
          return json({ error: "Sign in as admin first." }, 401, cors);
        }
        const key = safeKey(decodeURIComponent(path.slice("/api/admin/media/".length)));
        if (!key || key.length > 180) return json({ error: "Invalid file key." }, 400, cors);
        const contentType = request.headers.get("Content-Type") || "application/octet-stream";
        await env.MEDIA.put(key, request.body, { httpMetadata: { contentType } });
        return json({ success: true, key, url: `/api/media/${encodeURIComponent(key)}` }, 201, cors);
      }

      if (path.startsWith("/api/admin/anime/") && request.method === "DELETE") {
        if (!env.ADMIN_PASSWORD || !(await validToken(request, env.ADMIN_PASSWORD))) {
          return json({ error: "Sign in as admin first." }, 401, cors);
        }
        const id = Number(path.split("/").pop());
        if (!Number.isInteger(id)) return json({ error: "Invalid anime ID." }, 400, cors);
        await env.DB.prepare("DELETE FROM anime WHERE id = ?").bind(id).run();
        return json({ success: true }, 200, cors);
      }

      if (path.startsWith("/api/")) return json({ error: "API route not found." }, 404, cors);

      return env.ASSETS.fetch(request);
    } catch (error) {
      return json({ error: "Server error.", detail: error?.message || "Unknown error" }, 500, cors);
    }
  }
};
