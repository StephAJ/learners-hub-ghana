import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderH5pPlayer } from "../src/player-renderer.js";

describe("H5P player renderer", () => {
  it("forwards xAPI only to the configured Learners Hub origin", () => {
    const html = renderH5pPlayer(
      {
        contentId: "content-1",
        integration: { contents: {} },
        scripts: ["/h5p/core/js/h5p.js"],
        styles: ["/h5p/core/styles/h5p.css"],
      } as never,
      "https://school.example",
    );

    assert.match(html, /type: "h5p-xapi"/);
    assert.match(html, /https:\\u002f\\u002fschool\.example/);
    assert.doesNotMatch(html, /Download/);
  });
});
