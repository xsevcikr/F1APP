// Packages the standalone build into one HTML file: styles and script inlined,
// fonts from Google Fonts. Output: web/dist-standalone/f1-control-room.html
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = new URL("../dist-standalone/", import.meta.url).pathname;
const js = readFileSync(join(dir, "app.js"), "utf8").replace(/<\/script/gi, "<\\/script");
const cssFile = readdirSync(dir).find((f) => f.endsWith(".css"));
const css = cssFile ? readFileSync(join(dir, cssFile), "utf8").replace(/<\/style/gi, "<\\/style") : "";

const html = `<title>F1 Control Room</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Titillium+Web:wght@400;600;700;900&family=Barlow+Condensed:ital,wght@0,500;0,600;0,700;0,800;1,500;1,600;1,700&family=Poppins:wght@700&display=swap" rel="stylesheet">
<style>html,body,#root{height:100%}${css}</style>
<script>
try {
  var t = JSON.parse(localStorage.getItem("f1-settings") || "{}").state?.theme || "red";
  if (t === "system") t = matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  document.documentElement.dataset.theme = t;
} catch (e) { document.documentElement.dataset.theme = "red"; }
</script>
<div id="root"></div>
<script type="module">${js}</script>
`;
writeFileSync(join(dir, "f1-control-room.html"), html);
console.log(`f1-control-room.html: ${(html.length / 1024).toFixed(0)} KB`);
