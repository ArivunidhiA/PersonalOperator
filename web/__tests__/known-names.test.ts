import { it, expect } from "vitest";
import { FACTS, LINK_LABELS } from "@/lib/knowledge";
import { KNOWN_NAMES, knownNamesFrom } from "@/lib/known-names";

it("lists every capitalized word in his notes (regenerate lib/known-names.ts when the facts change)", () => {
  expect([...KNOWN_NAMES]).toEqual(knownNamesFrom(JSON.stringify([FACTS, LINK_LABELS])));
});
