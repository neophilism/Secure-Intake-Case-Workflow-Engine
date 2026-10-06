import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import axe from "axe-core";
import { renderToStaticMarkup } from "react-dom/server";
import LoginPage from "@/app/login/page";
import ForbiddenPage from "@/app/forbidden/page";

type AxeWindow = Window & typeof globalThis & {
  axe: {
    run: (
      context: Document,
      options?: Record<string, unknown>,
    ) => Promise<{ violations: Array<{ id: string; help: string }> }>;
  };
};

async function accessibilityViolations(markup: string) {
  const dom = new JSDOM(
    `<!doctype html>
<html lang="en">
<head><title>Accessibility test</title></head>
<body>${markup}</body>
</html>`,
    { runScripts: "outside-only" },
  );

  dom.window.eval(axe.source);
  const result = await (dom.window as unknown as AxeWindow).axe.run(
    dom.window.document,
    {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
      },
      rules: {
        "color-contrast": { enabled: false },
      },
    },
  );

  return result.violations.map((violation) => ({
    id: violation.id,
    help: violation.help,
  }));
}

describe("core page accessibility", () => {
  it("keeps the sign-in surface free of automated WCAG A/AA violations", async () => {
    const page = await LoginPage({
      searchParams: Promise.resolve({}),
    });
    const markup = renderToStaticMarkup(page);
    expect(await accessibilityViolations(markup)).toEqual([]);
  });

  it("keeps the access-denied surface free of automated WCAG A/AA violations", async () => {
    const markup = renderToStaticMarkup(<ForbiddenPage />);
    expect(await accessibilityViolations(markup)).toEqual([]);
  });
});
