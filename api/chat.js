// Server-side proxy: keeps the Anthropic API key in Vercel, never in the browser.
// Environment variables (Vercel > Project > Settings > Environment Variables):
//   ANTHROPIC_API_KEY       required
//   ANTHROPIC_WORKSPACE_ID  optional, only if your key isn't scoped to a workspace
//   ACCESS_CODE             optional but recommended; visitors must enter it once per device

const ALLOWED_MODELS = new Set(["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5"]);
const MAX_TOKENS = 16000;

function fail(res, status, type, message) {
  res.status(status).json({ type: "error", error: { type, message } });
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return fail(res, 405, "method", "Use POST.");

  const clean = v => (v || "").trim().replace(/^["']|["']$/g, "").trim();
  const key = clean(process.env.ANTHROPIC_API_KEY);
  if (!key) return fail(res, 500, "server_config", "The server has no API key. Add ANTHROPIC_API_KEY in Vercel and redeploy.");

  const required = clean(process.env.ACCESS_CODE);
  if (required && req.headers["x-access-code"] !== required) {
    return fail(res, 401, "access_code", "Access code required.");
  }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = null; } }
  if (!body || !Array.isArray(body.messages)) return fail(res, 400, "invalid_request", "Missing messages.");

  const payload = {
    model: ALLOWED_MODELS.has(body.model) ? body.model : "claude-sonnet-5-5",
    max_tokens: Math.min(Number(body.max_tokens) || MAX_TOKENS, MAX_TOKENS),
    system: typeof body.system === "string" ? body.system : undefined,
    tools: Array.isArray(body.tools) ? body.tools : undefined,
    messages: body.messages,
  };

  const headers = {
    "content-type": "application/json",
    "x-api-key": key,
    "anthropic-version": "2023-06-01",
  };
  const ws = clean(process.env.ANTHROPIC_WORKSPACE_ID);
  if (ws) headers["anthropic-workspace-id"] = ws;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers, body: JSON.stringify(payload) });
    const text = await r.text();
    res.status(r.status).setHeader("content-type", "application/json");
    res.send(text);
  } catch (e) {
    fail(res, 502, "upstream", "Couldn't reach Anthropic's API.");
  }
};
