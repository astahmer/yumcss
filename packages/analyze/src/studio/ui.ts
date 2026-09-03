/** Small, dependency-free local client. It never evaluates project code. */
export const STUDIO_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Pandwind Studio</title>
<style>
:root { color-scheme: dark; font: 14px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; background: #101014; color: #f0eff4; }
body { margin: 0; } header { display: flex; gap: 12px; align-items: center; padding: 14px 18px; border-bottom: 1px solid #2a2932; }
h1 { font: 600 18px system-ui, sans-serif; margin: 0 18px 0 0; } input, select, button, textarea { color: inherit; background: #17171d; border: 1px solid #3a3945; border-radius: 6px; padding: 8px; }
button { cursor: pointer; } button:hover { border-color: #f2a65a; } #root { flex: 1; } main { display: grid; grid-template-columns: 280px minmax(0, 1fr) minmax(320px, 0.8fr); gap: 12px; padding: 12px; min-height: calc(100vh - 70px); box-sizing: border-box; }
section { min-width: 0; border: 1px solid #2a2932; border-radius: 8px; overflow: hidden; } .heading { padding: 10px 12px; color: #a5a2b0; border-bottom: 1px solid #2a2932; text-transform: uppercase; letter-spacing: .08em; font-size: 11px; }
.body { padding: 12px; } .stack { display: grid; gap: 10px; } .row { display: flex; gap: 8px; } .row > * { min-width: 0; flex: 1; } textarea, pre { width: 100%; box-sizing: border-box; min-height: 420px; resize: vertical; font: inherit; white-space: pre; overflow: auto; } pre { margin: 0; padding: 12px; background: #0b0b0e; }
.muted { color: #8e8b98; } .error { color: #ff8e8e; white-space: pre-wrap; } .ok { color: #9ee493; } @media (max-width: 1000px) { main { grid-template-columns: 1fr; } textarea, pre { min-height: 260px; } }
</style>
</head>
<body>
<header><h1>pandwind / studio</h1><input id="root" placeholder="project root" /><button id="open">Open</button><span id="status" class="muted">connecting…</span></header>
<main>
<section><div class="heading">workspace</div><div class="body stack"><select id="file"></select><pre id="tree">Open a project to inspect its source tree.</pre></div></section>
<section><div class="heading">source editor (memory only)</div><div class="body stack"><textarea id="editor" spellcheck="false"></textarea><div class="row"><button id="apply">Apply edit</button><button id="evaluate">Evaluate target</button></div></div></section>
<section><div class="heading">migration result</div><div class="body stack"><div class="row"><select id="source"></select><select id="target"></select></div><pre id="output">Open a project to load registered adapters.</pre><details><summary>semantic program</summary><pre id="semantic">No semantic program yet.</pre></details><details><summary>themes and tokens</summary><pre id="themes">No theme data yet.</pre></details><details><summary>canonical CSS</summary><pre id="css">No CSS validation yet.</pre></details><details><summary>artifacts and size</summary><pre id="artifacts">No artifacts yet.</pre></details><details><summary>host preview</summary><pre id="preview">Static mode only.</pre></details><div id="diagnostics" class="muted"></div></div></section>
</main>
<script>
const token = new URL(location.href).searchParams.get("token") || "";
const headers = { "content-type": "application/json", "x-pandwind-studio-token": token };
let snapshot = null;
let selectedFile = "";
const $ = (id) => document.getElementById(id);
const status = (text, className = "muted") => { $("status").textContent = text; $("status").className = className; };
const call = async (path, body) => {
  const response = await fetch(path + "?token=" + encodeURIComponent(token), body ? { method: "POST", headers, body: JSON.stringify(body) } : { headers });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || "studio request failed");
  snapshot = value; render(); return value;
};
const option = (value, label) => { const item = document.createElement("option"); item.value = value; item.textContent = label; return item; };
const renderAdapters = () => {
  const adapters = snapshot.adapters || { sources: [], targets: [] };
  const source = $("source");
  const target = $("target");
  const selectedSource = snapshot.target?.source || "";
  const selectedTarget = snapshot.target?.target || adapters.targets[0]?.id || "";
  source.replaceChildren(option("", "auto-detect source"), ...adapters.sources.map(({ id, label }) => option(id, label)));
  target.replaceChildren(...adapters.targets.map(({ id, label }) => option(id, label)));
  source.value = selectedSource;
  target.value = selectedTarget;
};
const render = () => {
  if (!snapshot) return;
  $("root").value = snapshot.workspace.root;
  const files = snapshot.workspace.files;
  if (!files.some(({ document }) => document.file === selectedFile)) selectedFile = files[0]?.document.file || "";
  $("file").replaceChildren(...files.map(({ document }) => { const option = document.createElement("option"); option.value = document.file; option.textContent = document.file.replace(snapshot.workspace.root + "/", ""); return option; }));
  $("file").value = selectedFile;
  $("editor").value = files.find(({ document }) => document.file === selectedFile)?.document.source || "";
  renderAdapters();
  $("tree").textContent = JSON.stringify(snapshot.evaluation?.tree || { roots: [] }, null, 2);
  $("output").textContent = snapshot.evaluation?.artifacts?.targetCode || "No target output yet.";
  $("semantic").textContent = JSON.stringify(snapshot.evaluation?.semantic || { programs: [] }, null, 2);
  $("themes").textContent = JSON.stringify(snapshot.evaluation?.themes || { scopes: [] }, null, 2);
  const artifacts = snapshot.evaluation?.artifacts || {};
  $("css").textContent = artifacts.targetCss || artifacts.sourceCss || "No CSS validation yet.";
  $("artifacts").textContent = JSON.stringify({ files: artifacts.files || [], sourceBytes: artifacts.sourceBytes, targetBytes: artifacts.targetBytes }, null, 2);
  $("preview").textContent = JSON.stringify(snapshot.preview || { status: "unavailable", message: "Static mode only." }, null, 2);
  const diagnostics = snapshot.evaluation?.diagnostics || [];
  const conflicts = snapshot.workspace.conflicts || [];
  $("diagnostics").textContent = diagnostics.length ? diagnostics.map(({ message, file }) => (file ? file + ": " : "") + message).join("\\n") : "No diagnostics.";
  if (conflicts.length) status("conflict: reopen to reload disk", "error");
  status("live", "ok");
};
$("file").addEventListener("change", async (event) => { selectedFile = event.target.value; render(); try { await call("/api/studio/select", { file: selectedFile }); } catch (error) { status(String(error), "error"); } });
$("open").addEventListener("click", async () => { try { await call("/api/studio/open", { root: $("root").value }); } catch (error) { status(String(error), "error"); } });
$("apply").addEventListener("click", async () => { try { await call("/api/studio/edit", { file: selectedFile, source: $("editor").value }); } catch (error) { status(String(error), "error"); } });
$("evaluate").addEventListener("click", async () => { try { await call("/api/studio/target", { source: $("source").value || undefined, target: $("target").value }); } catch (error) { status(String(error), "error"); } });
const events = new EventSource("/api/studio/events?token=" + encodeURIComponent(token));
events.onmessage = (event) => { snapshot = JSON.parse(event.data); render(); };
events.onerror = () => status("connection lost; retrying…", "error");
call("/api/studio/snapshot").catch((error) => status(String(error), "error"));
</script>
</body>
</html>`;
