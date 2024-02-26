#!/usr/bin/env node

const {program} = require('commander');

const pkg = require('./package.json');
const { download } = require('@electron/get');
const { HttpsProxyAgent } = require('hpagent');

program
  .name('electron download helper')
  .description('download electron into cache dir for help')
  .version(pkg.version)
  .option('-t, --target <electronVersion>', 'version of target electron, 26/26.6/26.6.2 or dist-tags in `npm view electron`, are valid also.', 'latest')
  .option('-p, --proxy <proxy>', 'proxy to download electron, for example: http://localhost:1080');
  // .option('-h, --http-proxy-host <host>', 'http proxy host')
  // .option('-p, --http-proxy-port <port>', 'http proxy port');

program.parse();
const options = program.opts();

function* parseTags(versionMap) {
  let line = '';
  do {
    line = yield;
  } while ('dist-tags:' !== line.trim());

  do {
    line = yield;
    if ('' === line.trim()) break;
    const [tag, detail] = line.split(':').map(text => text.trim());
    const fuzzyVersion = tag.replace(/-/g, '.').replace(/[xy]/g, '0');
    versionMap[fuzzyVersion] = detail;
  } while (true);

  try {
    while(true) yield versionMap;
  } finally {
    return versionMap;
  }
}

function gotVersion(version) {
  if (/^[\d]+\.[\d]+\.[\d]+$/.test(version)) return version;
  const {execSync} = require('node:child_process');
  const ret = execSync('npm view electron').toString();

  const parser = parseTags({});
  ret.split('\n').forEach(line => {
    parser.next(line);
  });

  const {value: map} = parser.return();
  const versionByTag = map[version];
  if (versionByTag) return versionByTag;
  const [x, y = '0', z = '0'] = version.split('.');
  const fullVersion = `${x}.${y}.${z}`;
  const detailVersion = map[fullVersion];
  if (detailVersion) return detailVersion;
  console.error('can not find right version you want!', version);
  process.exit(1);
}

const cliProgress = require('cli-progress');
const bar1 = new cliProgress.SingleBar({
  fps: 5,
  format: '{bar} {percentage}% | {value} / {total} | {duration_formatted} | ETA: {eta_formatted}',
  formatValue(v, options, type) {
    if (['value', 'total'].includes(type))
      return `${(v/1024/1024).toFixed(1)}MB`;
    return v;
  },
  stopOnComplete: true,
}, cliProgress.Presets.shades_classic);
let total = 0;
// disable default progress bar
process.env.ELECTRON_GET_NO_PROGRESS = '1';

download(gotVersion(options.target), {
  downloadOptions: {
    agent: options.proxy ? {
      https: new HttpsProxyAgent({
        keepAlive: true,
        proxy: options.proxy,
      }),
    } : undefined,
    quiet: true,
    getProgressCallback(progress) {
      // progress.total maybe undefined!!!
      if (total === 0 && progress.total) {
        total = progress.total;
        bar1.start(progress.total, progress.transferred);
      } else if (progress.transferred < progress.total) {
        bar1.update(progress.transferred);
      } else if (progress.transferred > 0 && (progress.transferred === progress.total || progress.percent === 1)) {
        bar1.update(progress.transferred);
        bar1.stop();
      }
    },
  }
});
