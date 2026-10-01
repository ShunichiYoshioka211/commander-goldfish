// e2e を計装つきで走らせ、e2e だけのカバレッジが 100% に届いているかを確かめる。
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';

rmSync('.nyc_output', { recursive: true, force: true });
rmSync('coverage', { recursive: true, force: true });
const run = (cmd: string) => spawnSync(cmd, { stdio: 'inherit', shell: true }).status ?? 1;
const e2e = run(`npx playwright test ${process.argv.slice(2).join(' ')}`);
const report = run('npx nyc report');
process.exit(e2e || report);
