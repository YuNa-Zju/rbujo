import assert from "node:assert/strict";
import test from "node:test";

import {
  markUpdateDismissed,
  shouldPromptForAvailableUpdate,
} from "../src/services/updatePromptPolicy.ts";

test("startup prompts for an available update that was not dismissed", () => {
  assert.equal(
    shouldPromptForAvailableUpdate({
      source: "startup",
      updateVersion: "0.1.4",
      dismissedVersion: null,
    }),
    true,
  );
});

test("startup suppresses the same dismissed update version", () => {
  const dismissed = markUpdateDismissed("0.1.4");

  assert.equal(
    shouldPromptForAvailableUpdate({
      source: "startup",
      updateVersion: "0.1.4",
      dismissedVersion: dismissed,
    }),
    false,
  );
});

test("startup prompts again when a newer update appears", () => {
  assert.equal(
    shouldPromptForAvailableUpdate({
      source: "startup",
      updateVersion: "0.1.5",
      dismissedVersion: "0.1.4",
    }),
    true,
  );
});

test("manual checks prompt even if that version was dismissed", () => {
  assert.equal(
    shouldPromptForAvailableUpdate({
      source: "manual",
      updateVersion: "0.1.4",
      dismissedVersion: "0.1.4",
    }),
    true,
  );
});
