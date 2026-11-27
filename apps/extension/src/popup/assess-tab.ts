/**
 * Runs a local assessment of a tab: inject collector -> validate -> assess.
 * Nothing is stored and nothing leaves the device.
 */
import { assessSnapshot, validateSnapshot } from '../../../../packages/core/src/index.ts';
import type { Assessment, ObservationSnapshot } from '../../../../packages/core/src/types.ts';
import { createKnowledgeBase } from '../../../../packages/knowledge/src/index.ts';

const kb = createKnowledgeBase();

export type TabAssessment =
  | { kind: 'assessed'; assessment: Assessment; snapshot: ObservationSnapshot; warnings: string[] }
  | { kind: 'error'; reason: string };

export function isAssessableUrl(url: string | undefined): boolean {
  return typeof url === 'string' && /^https?:\/\//i.test(url);
}

export async function assessTab(tabId: number, url: string | undefined): Promise<TabAssessment> {
  if (!isAssessableUrl(url)) {
    return { kind: 'error', reason: 'Plaster can only assess ordinary web pages (http or https). Browser pages, the extension store and local files cannot be inspected.' };
  }
  let raw: unknown;
  try {
    // Main frame only: activeTab does not grant access to cross-origin iframes.
    await chrome.scripting.executeScript({ target: { tabId }, files: ['collector.js'] });
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => (globalThis as unknown as { __plasterCollect: () => unknown }).__plasterCollect(),
    });
    raw = result?.result;
  } catch (err) {
    return { kind: 'error', reason: `Plaster could not inspect this page (${err instanceof Error ? err.message : 'unknown error'}).` };
  }
  // The snapshot crossed a trust boundary (it was built inside the page's process): validate it.
  const validated = validateSnapshot(raw);
  if (!validated.ok) return { kind: 'error', reason: `The page observation was invalid: ${validated.errors.join('; ')}` };
  return { kind: 'assessed', assessment: assessSnapshot(validated.data, kb), snapshot: validated.data, warnings: validated.warnings };
}
