import fs from "node:fs";
import path from "node:path";

const distDir = "dist";
const htmlPath = path.join(distDir, "index.html");
let html = fs.readFileSync(htmlPath, "utf8");
const inlineScripts = [];

html = html.replace(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g, (_match, href) => {
  const cssPath = path.join(distDir, href.replace(/^\.?\//, ""));
  return `<style>${fs.readFileSync(cssPath, "utf8")}</style>`;
});

html = html.replace(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g, (_match, src) => {
  const jsPath = path.join(distDir, src.replace(/^\.?\//, ""));
  let js = fs.readFileSync(jsPath, "utf8");
  const deviceImage = `data:image/png;base64,${fs.readFileSync(path.join("public", "orbit-device.png")).toString("base64")}`;
  const frontFrameImage = `data:image/png;base64,${fs.readFileSync(path.join("public", "orbit-front-frame.png")).toString("base64")}`;
  js = js.replaceAll("/Orbit/orbit-device.png", deviceImage);
  js = js.replaceAll("/orbit-device.png", deviceImage);
  js = js.replaceAll("/Orbit/orbit-front-frame.png", frontFrameImage);
  js = js.replaceAll("/orbit-front-frame.png", frontFrameImage);
  js = js.replaceAll("./orbit-front-frame.png", frontFrameImage);
  inlineScripts.push(`<script>${js}</script>`);
  return "";
});

html = html.replace("</body>", () => `${inlineScripts.join("\n")}\n  </body>`);

const rootSharePath = "Orbit-share.html";
const distSharePath = path.join(distDir, "Orbit-share.html");

fs.writeFileSync(rootSharePath, html);
fs.writeFileSync(distSharePath, html);
console.log(`wrote ${rootSharePath} (${fs.statSync(rootSharePath).size} bytes)`);
console.log(`wrote ${distSharePath} (${fs.statSync(distSharePath).size} bytes)`);
