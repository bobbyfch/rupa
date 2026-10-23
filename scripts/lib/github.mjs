// GitHub read helpers. GITHUB_TOKEN (CI only) just raises the anonymous rate limit; no provider key is involved.
import { getJson } from './net.mjs';
const headers = () => process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {};
export async function repoTree(repo, ref = 'HEAD') {
  const tree = await getJson(`https://api.github.com/repos/${repo}/git/trees/${ref}?recursive=1`, { headers: headers() });
  if (tree.truncated) throw new Error(`Git tree truncated for ${repo}; refusing partial index`);
  return tree;
}
export async function repoCommit(repo, ref = 'HEAD') {
  const commit = await getJson(`https://api.github.com/repos/${repo}/commits/${ref}`, { headers: headers() });
  return { sha: commit.sha, date: commit.commit?.committer?.date };
}
export async function repoLicense(repo) {
  const data = await getJson(`https://api.github.com/repos/${repo}`, { headers: headers() });
  return { spdx: data.license?.spdx_id || 'NOASSERTION', name: data.license?.name || null, url: data.license?.url || null, pushedAt: data.pushed_at };
}
// Fallback for repos whose recursive tree API call times out: walk selected top-level directories one tree at a time.
export async function repoDirTrees(repo, dirs, ref = 'HEAD') {
  const root = await getJson(`https://api.github.com/repos/${repo}/git/trees/${ref}`, { headers: headers() });
  const tree = [];
  for (const dir of dirs) {
    const node = root.tree.find(entry => entry.path === dir && entry.type === 'tree');
    if (!node) continue;
    const sub = await getJson(`https://api.github.com/repos/${repo}/git/trees/${node.sha}`, { headers: headers() });
    if (sub.truncated) throw new Error(`Git tree truncated for ${repo}/${dir}`);
    tree.push(...sub.tree.map(entry => ({ ...entry, path: `${dir}/${entry.path}` })));
  }
  return { tree };
}
