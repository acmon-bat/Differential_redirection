/**
 * Popup entry point. Opening the popup is the user gesture that grants
 * activeTab for the current tab; the assessment runs immediately and locally.
 */
import { assessTab } from './assess-tab.ts';
import { renderAssessment, renderMessage } from './render.ts';
import { METHODOLOGY_VERSION } from '../../../../packages/core/src/index.ts';
import { KNOWLEDGE_VERSION } from '../../../../packages/knowledge/src/index.ts';

declare const __PLASTER_TEST__: boolean;

async function run(tabId: number, url: string | undefined): Promise<void> {
  const root = document.getElementById('app')!;
  renderMessage(root, 'Assessing this page locally…');
  const result = await assessTab(tabId, url);
  if (result.kind === 'assessed') renderAssessment(root, result.assessment, result.snapshot);
  else renderMessage(root, result.reason);
}

async function main(): Promise<void> {
  document.getElementById('versions')!.textContent = `methodology ${METHODOLOGY_VERSION} · knowledge ${KNOWLEDGE_VERSION}`;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) {
    renderMessage(document.getElementById('app')!, 'No active tab to assess.');
    return;
  }
  await run(tab.id, tab.url);
}

if (__PLASTER_TEST__) {
  // TEST BUILD ONLY (stripped from production bundles by esbuild `define`):
  // lets the integration test drive an assessment of a specific tab, because
  // automated tests cannot click the toolbar button that grants activeTab.
  (globalThis as unknown as Record<string, unknown>).__plasterTest = { run, assessTab };
} else {
  void main();
}
