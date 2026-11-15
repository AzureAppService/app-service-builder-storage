const { spawnSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const FILES = ['welcome.txt', 'checklist.txt', 'demo-metrics.csv'];

function parseArgs(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === '--confirm-demo-seed' && !options.confirm) options.confirm = true;
    else if (['--subscription', '--account-name', '--container-name'].includes(flag)
        && !options[flag] && args[i + 1] && !args[i + 1].startsWith('--')) {
      options[flag] = args[++i];
    } else throw new Error('Expected explicit subscription, account, container and --confirm-demo-seed; unknown or repeated option');
  }
  if (!options.confirm
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(options['--subscription'] || '')
      || !/^[a-z0-9]{3,24}$/.test(options['--account-name'] || '')
      || !/^(?!.*--)[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/.test(options['--container-name'] || '')) {
    throw new Error('Confirm synthetic demo uploads and supply a valid subscription GUID, storage account and container');
  }
  return options;
}

function seed(args, run = spawnSync, log = console.log) {
  const options = parseArgs(args);
  const files = FILES.map(name => {
    const file = path.join(__dirname, '..', 'demo-files', name);
    const bytes = readFileSync(file);
    if (!bytes.length || bytes.length > 1024) throw new Error(`Invalid bounded demo fixture: ${name}`);
    return { name, file };
  });
  for (const { name, file } of files) {
    const result = run('az', ['storage', 'blob', 'upload',
      '--subscription', options['--subscription'],
      '--account-name', options['--account-name'],
      '--container-name', options['--container-name'],
      '--name', `filevault-demo/${name}`, '--file', file,
      '--auth-mode', 'login', '--type', 'block', '--overwrite', 'false',
      '--if-none-match', '*', '--only-show-errors', '--output', 'none'],
    { encoding: 'utf8', timeout: 30000, maxBuffer: 65536, shell: false });
    if (result.error || result.signal) throw new Error(`Demo upload failed for ${name}: Azure CLI unavailable, interrupted or timed out`);
    if (result.status === 0) log(`Created synthetic demo file: ${name}`);
    else if (/\bErrorCode:\s*(?:BlobAlreadyExists|ConditionNotMet)\b/.test(result.stderr || '')) {
      log(`Existing file left unchanged: ${name}`);
    } else throw new Error(`Demo upload failed for ${name}: check signed-in identity, container role, network and Azure CLI diagnostics`);
  }
}

if (require.main === module) {
  try { seed(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { seed };
