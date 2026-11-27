/**
 * Command-line demonstration of the core engine, independent of any browser.
 *
 *   npm run demo:cli -- fixtures/snapshots/tracker-heavy-news.json
 *   npm run demo:cli -- fixtures/snapshots/insecure-login.json --json
 *
 * Reads a local JSON snapshot and prints a readable report. No network access.
 */
import { readFileSync } from 'node:fs';
import { assess } from '../packages/core/src/index.ts';
import { createKnowledgeBase } from '../packages/knowledge/src/index.ts';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
if (!file) {
  console.error('Usage: npm run demo:cli -- <snapshot.json> [--json]');
  process.exit(2);
}

const result = assess(JSON.parse(readFileSync(file, 'utf8')), createKnowledgeBase());
if (!result.ok) {
  console.error('Invalid snapshot:\n  ' + result.errors.join('\n  '));
  process.exit(1);
}
const a = result.assessment;
if (args.includes('--json')) {
  console.log(JSON.stringify(a, null, 2));
  process.exit(0);
}

const LIGHT = { green: '●G', amber: '●A', red: '●R', grey: '○ ' } as const;
const scoreText = a.score === null ? 'score withheld' : `${a.score}/100${a.scoreCapped ? ' capped' : ''}`;
const grade = a.grade ? `${a.grade} (${scoreText}, ${a.gradeStatus})` : `withheld (${a.gradeStatus})`;
console.log(`\nPlaster assessment: ${a.subject}`);
console.log(`methodology ${a.methodologyVersion} · engine ${a.engineVersion} · knowledge ${a.knowledgeVersion}\n`);
console.log(`Privacy grade     : ${grade}`);
console.log(`Evidence quality  : ${Math.round(a.evidenceQuality * 100)}%`);
console.log(`Confidence        : ${a.confidence}`);
for (const r of a.confidenceReasons) console.log(`                    - ${r}`);
for (const c of a.caps) console.log(`CAP               : max ${c.maxGrade}: ${c.reason}`);

console.log('\nCategories');
for (const c of a.categories) {
  const score = c.score === null ? c.status : `${c.score}/100`;
  console.log(`  ${LIGHT[c.light]} ${c.title.padEnd(26)} ${score.padEnd(22)} evidence ${Math.round(c.evidenceQuality * 100)}%`);
  for (const ch of c.checks) {
    if (ch.outcome === 'not-applicable') continue;
    console.log(`       [${ch.outcome.padEnd(7)}] ${ch.title}: ${ch.explanation}`);
  }
}

console.log('\nPersonal information guidance');
for (const g of a.guidance) {
  console.log(`  ${g.level.padEnd(18)} ${g.label}${g.requestedOnPage ? ' (requested on this page)' : ''}`);
  console.log(`  ${''.padEnd(18)} ${g.reasons[0]}`);
}

console.log(`\nPrivacy-enhancing technologies (informational, no score effect): L${a.pet.level}: ${a.pet.summary}`);
console.log('\nWhat Plaster could not see');
for (const u of a.unobservable) console.log(`  - ${u}`);
if (result.warnings.length) console.log(`\nValidation warnings: ${result.warnings.join('; ')}`);
console.log('');
