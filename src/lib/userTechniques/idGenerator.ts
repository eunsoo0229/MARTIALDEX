import { getTechnique } from '../loadData';
import { userTechniqueRepository } from './repository';
import { addTeqRepository } from '../addTeq/repository';

// Same `${martialArt}__${slug}` convention as the 1,253 official techniques
// (e.g. "boxing__jab", "bjj__마운트-탈출") — see data/curated/videos.json for
// confirmation of the exact separator/casing used throughout the app.
function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '') // keep letters (incl. Korean)/numbers/spaces/hyphens only
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function idExists(id: string): boolean {
  return !!getTechnique(id) || !!addTeqRepository.get(id) || !!userTechniqueRepository.get(id);
}

/** Never collides with an existing official, shared add_teq, or user-added id — stable once picked (spec section 11/15). */
export function generateUserTechniqueId(martialArt: string, name: string): string {
  const base = `${martialArt}__${slugify(name) || 'technique'}`;
  if (!idExists(base)) return base;
  let suffix = 2;
  while (idExists(`${base}-${suffix}`)) suffix++;
  return `${base}-${suffix}`;
}
