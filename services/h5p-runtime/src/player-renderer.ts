import type { IPlayerModel } from "@lumieducation/h5p-server";

export function renderH5pPlayer(
  model: IPlayerModel,
  parentOrigin: string,
) {
  return `<!doctype html>
<html class="h5p-iframe" lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Interactive lesson</title>
  ${renderStyles(model.styles)}
  ${renderScripts(model.scripts)}
  <script>window.H5PIntegration=${inlineJson(model.integration)};</script>
</head>
<body>
  <div class="h5p-content" data-content-id="${escapeAttribute(model.contentId)}"></div>
  <script>
    (function () {
      var parentOrigin = ${inlineJson(parentOrigin)};
      function connectResults() {
        if (!window.H5P || !H5P.externalDispatcher) return;
        H5P.externalDispatcher.on("xAPI", function (event) {
          var statement = event && event.data && event.data.statement;
          if (!statement || typeof statement !== "object") return;
          window.parent.postMessage({ type: "h5p-xapi", statement: statement }, parentOrigin);
        });
      }
      if (window.H5P && H5P.jQuery) {
        H5P.jQuery(document).ready(connectResults);
      } else {
        window.addEventListener("load", connectResults, { once: true });
      }
    })();
  </script>
</body>
</html>`;
}

function renderStyles(styles: string[]) {
  return styles
    .map((style) => `<link rel="stylesheet" href="${escapeAttribute(style)}">`)
    .join("\n  ");
}

function renderScripts(scripts: string[]) {
  return scripts
    .map((script) => `<script src="${escapeAttribute(script)}"></script>`)
    .join("\n  ");
}

function inlineJson(value: unknown) {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll("/", "\\u002f")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

function escapeAttribute(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
