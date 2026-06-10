import { dbQueries } from '../db/index';
import { paint } from '../ui';

export async function run() {
  const args = process.argv.slice(2).filter(a => !a.startsWith('-'));
  // args[0] = 'use', args[1] = target (number or url)
  const target = args[1];

  if (!target) {
    console.error(`\n  Usage: wasper use <number|url>\n`);
    process.exit(1);
  }

  const history = dbQueries.getSpecHistory();

  let url: string | null = null;

  const num = parseInt(target, 10);
  if (!isNaN(num) && num >= 1 && num <= history.length) {
    url = history[num - 1]?.url ?? null;
  } else if (target.startsWith('http')) {
    url = target;
  } else {
    // fuzzy match by title
    const match = history.find(r => r.title?.toLowerCase().includes(target.toLowerCase()));
    if (match) url = match.url;
  }

  if (!url) {
    console.error(`\n  ${paint.red('✗')}  Spec not found: ${target}\n`);
    console.error(`  Run ${paint.cyan('wasper ls')} to see saved specs.\n`);
    process.exit(1);
  }

  console.log(`\n  ${paint.dim('→')}  Starting with ${paint.cyan(url)}\n`);

  // Delegate to start with the resolved URL
  const { run: startRun } = await import('./start');
  await startRun({ url });
}
