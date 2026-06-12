import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAttachmentMarkdown,
  extractUploadRelativePath,
  filenameFromPath,
  isCompressibleImageFile,
  isPhysicalPointInsideElement,
  isPointInsideElement,
  normalizeTauriAttachmentDropPayload,
  physicalPointToCssPoint,
  replaceAttachmentReferences,
  resolveAttachmentUploadMode,
  shouldHandleDomAttachmentDrop,
  shouldAcceptTauriAttachmentDrop,
} from "../src/services/attachmentService.ts";

test("attachment markdown preserves batch order and uses image syntax only for images", () => {
  const markdown = buildAttachmentMarkdown([
    {
      name: "课程截图.png",
      type: "image/png",
      url: "asset://localhost/private/uploads/a.png",
    },
    {
      name: "slides.pdf",
      type: "application/pdf",
      url: "asset://localhost/private/uploads/b.pdf",
    },
  ]);

  assert.equal(
    markdown,
    "![课程截图.png](asset://localhost/private/uploads/a.png)\n[slides.pdf](asset://localhost/private/uploads/b.pdf)\n",
  );
});

test("attachment markdown treats image extensions as images when mime type is missing", () => {
  assert.equal(
    buildAttachmentMarkdown([
      {
        name: "dragged-photo.PNG",
        type: "",
        url: "asset://localhost/private/uploads/photo.png",
      },
    ]),
    "![dragged-photo.PNG](asset://localhost/private/uploads/photo.png)\n",
  );
});

test("attachment paths keep dropped filenames and only target active editor bounds", () => {
  assert.equal(
    filenameFromPath(
      "/Users/hemingyuna/Library/Application Support/fun.yunazju.rbujo/uploads/飞天5k.jpeg",
    ),
    "飞天5k.jpeg",
  );
  assert.equal(filenameFromPath("C:\\Users\\me\\Desktop\\notes.pdf"), "notes.pdf");

  const element = {
    getBoundingClientRect: () =>
      ({
        left: 10,
        top: 20,
        right: 110,
        bottom: 120,
      }) as DOMRect,
  };

  assert.equal(isPointInsideElement({ x: 10, y: 20 }, element), true);
  assert.equal(isPointInsideElement({ x: 60, y: 80 }, element), true);
  assert.equal(isPointInsideElement({ x: 9, y: 80 }, element), false);
  assert.equal(isPointInsideElement({ x: 60, y: 121 }, element), false);
});

test("physical drag positions are converted once before editor hit testing", () => {
  const element = {
    getBoundingClientRect: () =>
      ({
        left: 100,
        top: 20,
        right: 140,
        bottom: 80,
      }) as DOMRect,
  };

  assert.deepEqual(physicalPointToCssPoint({ x: 210, y: 60 }, 2), {
    x: 105,
    y: 30,
  });
  assert.equal(isPhysicalPointInsideElement({ x: 210, y: 60 }, element, 2), true);
  assert.equal(
    isPhysicalPointInsideElement({ x: 190, y: 60 }, element, 2),
    false,
  );
});

test("tauri file drops accept physical or logical positions inside the active editor", () => {
  const element = {
    contains: (node: unknown) => node === "textarea",
    getBoundingClientRect: () =>
      ({
        left: 100,
        top: 20,
        right: 140,
        bottom: 80,
      }) as DOMRect,
  };

  assert.deepEqual(
    normalizeTauriAttachmentDropPayload({
      type: "drop",
      paths: ["/Users/me/Desktop/a.png"],
      position: { x: 210, y: 60 },
    }),
    {
      type: "drop",
      paths: ["/Users/me/Desktop/a.png"],
      position: { x: 210, y: 60 },
    },
  );

  assert.deepEqual(
    shouldAcceptTauriAttachmentDrop(
      {
        type: "drop",
        paths: ["/Users/me/Desktop/a.png"],
        position: { x: 210, y: 60 },
      },
      element,
      2,
      null,
    ),
    ["/Users/me/Desktop/a.png"],
  );
  assert.deepEqual(
    shouldAcceptTauriAttachmentDrop(
      {
        type: "drop",
        paths: ["/Users/me/Desktop/a.png"],
        position: { x: 105, y: 30 },
      },
      element,
      2,
      null,
    ),
    ["/Users/me/Desktop/a.png"],
  );
  assert.deepEqual(
    shouldAcceptTauriAttachmentDrop(
      {
        type: "drop",
        paths: ["/Users/me/Desktop/a.png"],
      },
      element,
      2,
      "textarea",
    ),
    ["/Users/me/Desktop/a.png"],
  );
});

test("dom file drops are ignored inside tauri to avoid duplicate native path uploads", () => {
  assert.equal(shouldHandleDomAttachmentDrop(true, [new File(["a"], "a.png")]), false);
  assert.equal(shouldHandleDomAttachmentDrop(false, [new File(["a"], "a.png")]), true);
  assert.equal(shouldHandleDomAttachmentDrop(false, []), false);
});

test("attachment upload mode only compresses supported image batches when requested", () => {
  const png = new File(["image"], "image.png", { type: "image/png" });
  const emptyMimePng = new File(["image"], "dragged.png", { type: "" });
  const gif = new File(["gif"], "anim.gif", { type: "image/gif" });
  const pdf = new File(["pdf"], "notes.pdf", { type: "application/pdf" });

  assert.equal(isCompressibleImageFile(png), true);
  assert.equal(isCompressibleImageFile(emptyMimePng), true);
  assert.equal(isCompressibleImageFile(gif), false);
  assert.equal(resolveAttachmentUploadMode([pdf], "compressed"), "original");
  assert.equal(resolveAttachmentUploadMode([gif], "compressed"), "original");
  assert.equal(resolveAttachmentUploadMode([png, pdf], "compressed"), "compressed");
});

test("upload references can be extracted and rewritten across exported backups", () => {
  const oldUrl = "asset://localhost/private/uploads/abc123.png";
  const encodedOldUrl =
    "asset://localhost/%2FUsers%2Fme%2FLibrary%2FApplication%20Support%2Ffun.yunazju.rbujo%2Fuploads%2Fabc123.png";
  const content = `![old](${oldUrl})\n[raw](uploads/report.pdf)`;

  assert.equal(extractUploadRelativePath(oldUrl), "uploads/abc123.png");
  assert.equal(extractUploadRelativePath(encodedOldUrl), "uploads/abc123.png");
  assert.equal(extractUploadRelativePath("uploads/report.pdf"), "uploads/report.pdf");
  assert.equal(extractUploadRelativePath("https://example.com/uploads/report.pdf"), null);
  assert.equal(
    replaceAttachmentReferences(`${content}\n![encoded](${encodedOldUrl})`, new Map([
      ["uploads/abc123.png", "asset://localhost/private/uploads/new-image.png"],
      ["uploads/report.pdf", "asset://localhost/private/uploads/new-report.pdf"],
    ])),
    "![old](asset://localhost/private/uploads/new-image.png)\n[raw](asset://localhost/private/uploads/new-report.pdf)\n![encoded](asset://localhost/private/uploads/new-image.png)",
  );
});

test("external upload-like links are not rewritten during backup import", () => {
  const content = "[external](https://example.com/uploads/report.pdf)";

  assert.equal(
    replaceAttachmentReferences(content, new Map([
      ["uploads/report.pdf", "asset://localhost/private/uploads/local-report.pdf"],
    ])),
    content,
  );
});
