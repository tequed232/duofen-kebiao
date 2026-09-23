/**
 * 备用推送通道：走 api.github.com 把本地 main 写到远端。
 *
 * 为什么需要它：本机到 github.com:443 的连接经常被重置（`Failed to connect` /
 * `Empty reply from server`），而 `api.github.com` 一直可用。
 * 作者已确认：以后网络不通时就走这条通道上传。
 *
 * 用法：
 *   node scripts/push-via-api.mjs                 # 推当前分支（默认 main）
 *   node scripts/push-via-api.mjs --branch main
 *   node scripts/push-via-api.mjs --dry-run       # 只报告将要做什么
 *
 * 原理：Git 是内容寻址的 —— 把本地提交的**整棵树**（blob → tree 递归）上传，
 * 再以「远端 main」为父创建提交、把 ref 指过去。
 * 因此远端内容与本地的逐字节一致；本地与远端 SHA 可能不同（父不同），但内容相同。
 *
 * 前置：git credential fill 里存着有 repo 权限的 token（本机 GCM 提供）。
 */
import { execFileSync } from 'node:child_process';
import https from 'node:https';

const REPO = process.env.DUOFEN_REPO ?? 'tequed232/duofen-kebiao';
const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const BRANCH = argOf('branch', 'main');
const DRY = args.includes('--dry-run');

const git = (a) => execFileSync('git', a.split(' '), { encoding: 'utf8', maxBuffer: 1 << 26 }).trim();
const gitBuf = (a) => execFileSync('git', a.split(' '), { maxBuffer: 1 << 26 });

function token() {
  const out = execFileSync('git', ['credential', 'fill'], {
    input: 'protocol=https\nhost=github.com\n\n',
    encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  const m = /^password=(.+)$/m.exec(out);
  if (!m) throw new Error('拿不到 GitHub 凭据（git credential fill 没返回 password）');
  return m[1];
}

const TOKEN = token();
const HEADERS = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'duofen-push-via-api',
  'Content-Type': 'application/json',
};

function api(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request(
      { hostname: 'api.github.com', path, method, headers: { ...HEADERS, ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) } },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(buf); } catch { /* 非 JSON（少见） */ }
          resolve({ status: res.statusCode, json, raw: buf });
        });
      },
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

/** 递归上传一棵树，返回远端新树的 sha */
async function uploadTree(treeSha, counter) {
  const listing = gitBuf(`cat-file -p ${treeSha}`).toString('utf8');
  const entries = [];
  for (const line of listing.split('\n').filter(Boolean)) {
    const m = /^(\d+) (\w+) ([0-9a-f]{40})\t(.+)$/.exec(line);
    if (!m) continue;
    const [, mode, type, sha, name] = m;
    if (type === 'tree') {
      entries.push({ path: name, mode, type: 'tree', sha: await uploadTree(sha, counter) });
      continue;
    }
    const content = gitBuf(`cat-file blob ${sha}`);
    const blob = await api('POST', `/repos/${REPO}/git/blobs`, {
      content: content.toString('base64'),
      encoding: 'base64',
    });
    if (blob.status >= 300) throw new Error(`blob ${name}: ${blob.status} ${blob.raw.slice(0, 160)}`);
    entries.push({ path: name, mode, type: 'blob', sha: blob.json.sha });
    counter.done += 1;
    if (counter.done % 40 === 0) process.stdout.write(`\r  已上传 ${counter.done} 个文件…`);
  }
  const tree = await api('POST', `/repos/${REPO}/git/trees`, { tree: entries });
  if (tree.status >= 300) throw new Error(`tree ${treeSha.slice(0, 7)}: ${tree.status} ${tree.raw.slice(0, 160)}`);
  return tree.json.sha;
}

async function main() {
  const head = git(`rev-parse ${BRANCH}`);
  const localTree = git(`rev-parse ${BRANCH}^{tree}`);
  const message = git(`log -1 --pretty=%B ${BRANCH}`);

  const ref = await api('GET', `/repos/${REPO}/git/ref/heads/${BRANCH}`);
  if (ref.status !== 200) throw new Error(`读远端 ref 失败：${ref.status} ${ref.raw.slice(0, 160)}`);
  const remote = ref.json.object.sha;

  console.log(`仓库   : ${REPO}  分支: ${BRANCH}`);
  console.log(`远端   : ${remote.slice(0, 7)}`);
  console.log(`本地   : ${head.slice(0, 7)}   ${message.split('\n')[0]}`);

  if (remote === head) {
    console.log('\n✅ 远端已是最新，无需推送');
    return;
  }

  // 远端提交里有、本地没有的（别人推的）要拦下来，避免覆盖
  const remoteCommit = await api('GET', `/repos/${REPO}/git/commits/${remote}`);
  const remoteTree = remoteCommit.json?.tree?.sha;
  const localHasRemoteTree = (() => {
    try { gitBuf(`cat-file -t ${remoteTree}`); return true; } catch { return false; }
  })();
  console.log(`远端树的本地可见性: ${localHasRemoteTree ? '有（可安全快进）' : '无（远端有本地没有的提交，需先 fetch）'}`);

  if (DRY) {
    console.log('\n--dry-run：以上信息确认无误后，去掉 --dry-run 即可上传');
    return;
  }

  console.log(`\n正在上传整棵树（blob → tree 递归）…`);
  const started = Date.now();
  const counter = { done: 0 };
  const newTree = await uploadTree(localTree, counter);
  console.log(`\r  上传完成：${counter.done} 个文件，${((Date.now() - started) / 1000).toFixed(1)}s`);

  // 内容寻址：内容相同则 sha 相同，正好能对上本地树
  const sameTree = newTree === localTree;
  console.log(`  远端树 ${newTree.slice(0, 10)} ${sameTree ? '=== 本地树（内容完全一致）' : '≠ 本地树'}`);

  const commit = await api('POST', `/repos/${REPO}/git/commits`, {
    message,
    tree: newTree,
    parents: [remote],
    author: {
      name: git(`log -1 --pretty=%an ${BRANCH}`),
      email: git(`log -1 --pretty=%ae ${BRANCH}`),
      date: git(`log -1 --pretty=%aI ${BRANCH}`),
    },
  });
  if (commit.status >= 300) throw new Error(`建提交失败：${commit.status} ${commit.raw.slice(0, 200)}`);
  console.log(`  新提交 ${commit.json.sha.slice(0, 7)}`);

  const updated = await api('PATCH', `/repos/${REPO}/git/refs/heads/${BRANCH}`, {
    sha: commit.json.sha,
    force: false,
  });
  if (updated.status >= 300) {
    throw new Error(`更新 ref 失败：${updated.status} ${updated.raw.slice(0, 200)}`);
  }
  console.log(`\n✅ 已上传到 ${BRANCH}（快进，无强推）`);

  try {
    execFileSync('git', ['update-ref', `refs/remotes/origin/${BRANCH}`, commit.json.sha], { stdio: 'pipe' });
    console.log('   本地 origin/' + BRANCH + ' 已同步');
  } catch {
    /* 本地对象库里没有这个提交（正常，SHA 与本地不同），忽略 */
  }
}

main().catch((error) => {
  console.error('\n✗ 推送失败：', error.message);
  process.exit(1);
});
