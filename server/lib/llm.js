// 大模型调用：对外统一成 OpenAI 兼容的 /v1/chat/completions（含流式），内部按配置转发到
// OpenAI 兼容接口（DeepSeek / Kimi / 通义千问 / 代理）或 Anthropic Messages API。

function llmConfig(settings, env) {
  const s = (settings && settings.llm) || {};
  const kind = (env.LLM_KIND || s.kind || "openai").toLowerCase() === "anthropic" ? "anthropic" : "openai";
  const base = (env.LLM_BASE || s.base || "").replace(/\/+$/, "");
  const key = env.LLM_KEY || (settings && settings.llmKey) || "";
  const model = env.LLM_MODEL || s.model || "";
  return { kind, base, key, model, configured: !!(base && model) };
}

function toAnthropicBody(cfg, body) {
  const msgs = Array.isArray(body.messages) ? body.messages : [];
  const system = msgs.filter((m) => m.role === "system").map((m) => String(m.content || "")).join("\n\n");
  const messages = msgs.filter((m) => m.role === "user" || m.role === "assistant").map((m) => ({ role: m.role, content: String(m.content || "") }));
  const out = { model: cfg.model, max_tokens: Math.min(Number(body.max_tokens) || 16000, 64000), stream: !!body.stream, messages };
  if (system) out.system = system;
  if (!/-4-5/.test(cfg.model)) out.output_config = { effort: body.effort === "low" ? "low" : "medium" };
  if (/claude-(opus-5|sonnet-5-5|fable)/.test(cfg.model)) out.fallbacks = "default";
  return out;
}

function upstreamRequest(cfg, body) {
  const headers = { "Content-Type": "application/json" };
  let url, payload;
  if (cfg.kind === "anthropic") {
    url = cfg.base + "/v1/messages";
    headers["anthropic-version"] = "2023-06-01";
    if (cfg.key) headers["x-api-key"] = cfg.key;
    payload = toAnthropicBody(cfg, body);
    if (payload.fallbacks) headers["anthropic-beta"] = "server-side-fallback-2026-07-01";
  } else {
    url = cfg.base + "/chat/completions";
    if (cfg.key) headers["Authorization"] = "Bearer " + cfg.key;
    payload = { model: cfg.model, messages: body.messages, stream: !!body.stream, temperature: body.temperature == null ? 0.8 : body.temperature, max_tokens: Math.min(Number(body.max_tokens) || 8000, 16000) };
  }
  return { url, headers, payload };
}

// 把上游（OpenAI 或 Anthropic）的流转成 OpenAI 风格的 SSE 写给客户端
async function streamToClient(cfg, body, res) {
  const { url, headers, payload } = upstreamRequest(cfg, { ...body, stream: true });
  const up = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload) });
  if (!up.ok) { const text = await up.text(); res.writeHead(up.status, { "Content-Type": "application/json" }); res.end(text || JSON.stringify({ error: { message: "upstream " + up.status } })); return; }
  res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no" });
  const send = (delta) => res.write("data: " + JSON.stringify({ id: "ace", object: "chat.completion.chunk", choices: [{ index: 0, delta: { content: delta } }] }) + "\n\n");
  const ct = up.headers.get("content-type") || "";
  if (ct.includes("application/json")) { const j = await up.json(); send(extractText(cfg, j)); res.write("data: [DONE]\n\n"); res.end(); return; }
  const reader = up.body.getReader(); const dec = new TextDecoder(); let buf = "";
  const handle = (data) => {
    if (!data || data === "[DONE]") return;
    let j; try { j = JSON.parse(data); } catch (e) { return; }
    if (cfg.kind === "anthropic") { if (j.type === "content_block_delta" && j.delta && j.delta.type === "text_delta" && j.delta.text) send(j.delta.text); }
    else { const d = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content; if (d) send(d); }
  };
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true }); const lines = buf.split(/\r?\n/); buf = lines.pop();
    for (const line of lines) if (line.startsWith("data:")) handle(line.slice(5).trim());
  }
  if (buf.startsWith("data:")) handle(buf.slice(5).trim());
  res.write("data: [DONE]\n\n"); res.end();
}

function extractText(cfg, j) {
  if (cfg.kind === "anthropic") return (Array.isArray(j.content) ? j.content : []).filter((c) => c.type === "text").map((c) => c.text).join("");
  return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "";
}

// 非流式：服务端自己用（日报生成等）
async function complete(cfg, prompt, opts = {}) {
  const { url, headers, payload } = upstreamRequest(cfg, { messages: [{ role: "user", content: prompt }], stream: false, max_tokens: opts.maxTokens || 4000, effort: opts.effort });
  const up = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(opts.timeoutMs || 180000) });
  if (!up.ok) throw new Error("LLM upstream " + up.status + ": " + (await up.text()).slice(0, 300));
  const raw = await up.text(); let text = "";
  if ((up.headers.get("content-type") || "").includes("event-stream") || raw.startsWith("data:")) { // 个别接口对 stream:false 也返回 SSE
    for (const line of raw.split(/\r?\n/)) { if (!line.startsWith("data:")) continue; const d = line.slice(5).trim(); if (!d || d === "[DONE]") continue; try { const j = JSON.parse(d); text += cfg.kind === "anthropic" ? (j.type === "content_block_delta" && j.delta && j.delta.text) || "" : (j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content) || ""; } catch (e) {} }
  } else { let j; try { j = JSON.parse(raw); } catch (e) { throw new Error("LLM returned non-JSON"); } text = extractText(cfg, j); }
  if (!text) throw new Error("LLM returned empty text");
  return text;
}

// 非流式代理：返回 OpenAI 风格的 JSON
async function completeToClient(cfg, body, res) {
  const { url, headers, payload } = upstreamRequest(cfg, { ...body, stream: false });
  const up = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload) });
  const text = await up.text();
  if (!up.ok) { res.writeHead(up.status, { "Content-Type": "application/json" }); res.end(text); return; }
  let j; try { j = JSON.parse(text); } catch (e) { res.writeHead(502, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: { message: "bad upstream json" } })); return; }
  const content = extractText(cfg, j);
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ id: "ace", object: "chat.completion", choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }], usage: j.usage || {} }));
}

module.exports = { llmConfig, streamToClient, completeToClient, complete };
