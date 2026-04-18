// Repo catalog manager — loads and searches clonable repos
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface Repo {
  id: string;
  name: string;
  repo: string;
  path?: string;
  category: string;
  description: string;
  stars: number;
  tags: string[];
}

let cachedRepos: Repo[] | null = null;

export function loadRepos(): Repo[] {
  if (cachedRepos) return cachedRepos;
  const dataPath = join(__dirname, "data", "clonable-repos.json");
  cachedRepos = JSON.parse(readFileSync(dataPath, "utf-8")) as Repo[];
  return cachedRepos;
}

export function searchRepos(query: string): Repo[] {
  const repos = loadRepos();
  const q = query.toLowerCase();
  return repos.filter(
    (r) =>
      r.name.toLowerCase().includes(q) ||
      r.description.toLowerCase().includes(q) ||
      r.category.toLowerCase().includes(q) ||
      r.tags.some((t) => t.toLowerCase().includes(q))
  );
}

export function listReposByCategory(category?: string): Repo[] {
  const repos = loadRepos();
  if (!category) return repos;
  return repos.filter((r) => r.category.toLowerCase() === category.toLowerCase());
}

export function getCategories(): string[] {
  const repos = loadRepos();
  return [...new Set(repos.map((r) => r.category))].sort();
}

export function getRepoCloneUrl(repo: Repo): string {
  return `https://github.com/${repo.repo}.git`;
}
