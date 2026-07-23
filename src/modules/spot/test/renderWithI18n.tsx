import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import {
  render as testingLibraryRender,
  type RenderOptions,
  type RenderResult,
} from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";

i18n.load("en", {});
i18n.activate("en");

function I18nTestProvider({ children }: { children?: ReactNode }) {
  return <I18nProvider i18n={i18n}>{children}</I18nProvider>;
}

export function renderWithI18n(
  ui: ReactElement,
  options?: Omit<RenderOptions, "wrapper">,
): RenderResult {
  return testingLibraryRender(ui, { ...options, wrapper: I18nTestProvider });
}
