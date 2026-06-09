// Backward-compat entry — delegates to the start command.
// Use `cli.ts` (the bin) for full subcommand support.
import { run } from './src/commands/start.ts';
await run();
