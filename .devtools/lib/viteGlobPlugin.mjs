// esbuild plugin for .devtools tests: Vite's import.meta.glob(...) → static imports (eager, default import; dir/*.ext patterns only).
import fs from 'node:fs'; import path from 'node:path';
export const viteGlobPlugin = { name: 'vite-glob', setup(b) {
  b.onLoad({ filter: /\.(ts|tsx)$/ }, async (a) => {
    let src = fs.readFileSync(a.path, 'utf8');
    if (!src.includes('import.meta.glob')) return undefined;
    let n = 0; const imps = [];
    src = src.replace(/import\.meta\.glob(?:<[^>]*>)?\(\s*(\[[^\]]*\]|'[^']*'|"[^"]*")\s*,?\s*(\{[\s\S]*?\})?\s*\)/g, (_m, pats) => {
      const list = pats.match(/['"][^'"]+['"]/g).map((x) => x.slice(1, -1));
      const pos = list.filter((p) => !p.startsWith('!')); const neg = list.filter((p) => p.startsWith('!')).map((p) => p.slice(1));
      const toRe = (p) => new RegExp('^' + path.basename(p).replace(/[.]/g, '\\.').replace(/\*/g, '[^/]*') + '$');
      const entries = [];
      for (const p of pos) {
        const dir = path.resolve(path.dirname(a.path), path.dirname(p));
        for (const f of fs.readdirSync(dir)) {
          const rel = path.dirname(p) + '/' + f;
          if (!toRe(p).test(f) || neg.some((q) => path.dirname(q) === path.dirname(p) && toRe(q).test(f))) continue;
          const id = `__glob${n++}`; imps.push(`import ${id} from ${JSON.stringify(path.join(dir, f))};`); entries.push(`${JSON.stringify(rel)}: ${id}`);
        }
      }
      return `({${entries.join(',')}})`;
    });
    return { contents: imps.join('\n') + '\n' + src, loader: a.path.endsWith('x') ? 'tsx' : 'ts' };
  });
} };
