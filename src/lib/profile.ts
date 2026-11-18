import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface Venture {
  name: string;
  role: string;
  period: string;
  location: string;
  url: string;
  summary: string;
}

export interface ExperienceProject {
  title: string;
  url: string;
  summary: string;
}

export interface ExperienceItem {
  company: string;
  role: string;
  period: string;
  location: string;
  subroles: { title: string; period: string }[];
  bullets: string[];
  projects: ExperienceProject[];
}

export interface EducationItem {
  institution: string;
  degree: string;
  period: string;
  notes?: string;
}

export interface PublicationItem {
  title: string;
  venue: string;
  year?: string;
  url?: string;
}

export interface PressItem {
  title: string;
  outlet: string;
  date: string;
  url: string;
  summary: string;
}

export interface SkillGroup {
  category: string;
  items: string[];
}

export interface Profile {
  name: string;
  fullName: string;
  brand: string;
  headline: string;
  location: string;
  website: string;
  github: string;
  githubUsername: string;
  linkedin: string;
  x: string;
  summary: string;
  ventures: Venture[];
  experience: ExperienceItem[];
  education: EducationItem[];
  publications: PublicationItem[];
  press: PressItem[];
  certifications: string[];
  honors: string[];
  skills: SkillGroup[];
  languages: string[];
}

function parseFrontmatter(raw: string): {
  meta: Record<string, string>;
  body: string;
} {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    throw new Error("PROFILE.md is missing YAML frontmatter");
  }

  const meta: Record<string, string> = {};
  const lines = match[1].split(/\r?\n/);
  let currentBlockKey: string | null = null;
  let blockLines: string[] = [];

  const flushBlock = () => {
    if (currentBlockKey) {
      meta[currentBlockKey] = blockLines.join(" ").trim();
      currentBlockKey = null;
      blockLines = [];
    }
  };

  for (const line of lines) {
    if (currentBlockKey) {
      if (/^\s+/.test(line)) {
        blockLines.push(line.trim());
        continue;
      }
      flushBlock();
    }

    const kv = line.match(/^([a-zA-Z0-9_]+):\s*(.*)$/);
    if (!kv) continue;
    const [, key, value] = kv;
    if (value === ">-" || value === "|") {
      currentBlockKey = key;
      blockLines = [];
    } else {
      meta[key] = value.trim();
    }
  }
  flushBlock();

  return { meta, body: match[2] };
}

function splitSections(body: string): Map<string, string> {
  const sections = new Map<string, string>();
  const lines = body.split(/\r?\n/);
  let currentHeading: string | null = null;
  let buf: string[] = [];

  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+?)\s*$/);
    if (h2) {
      if (currentHeading) sections.set(currentHeading, buf.join("\n").trim());
      currentHeading = h2[1];
      buf = [];
    } else if (currentHeading) {
      buf.push(line);
    }
  }
  if (currentHeading) sections.set(currentHeading, buf.join("\n").trim());

  return sections;
}

interface RawEntry {
  heading: string;
  fields: Record<string, string>;
  lists: Record<string, string[]>;
}

function parseEntries(sectionBody: string): RawEntry[] {
  const entries: RawEntry[] = [];
  const lines = sectionBody.split(/\r?\n/);
  let current: RawEntry | null = null;
  let activeListKey: string | null = null;

  for (const line of lines) {
    const h3 = line.match(/^###\s+(.+?)\s*$/);
    if (h3) {
      if (current) entries.push(current);
      current = { heading: h3[1], fields: {}, lists: {} };
      activeListKey = null;
      continue;
    }

    if (!current) continue;

    const nestedItem = line.match(/^\s{2,}-\s+(.+?)\s*$/);
    if (nestedItem && activeListKey) {
      current.lists[activeListKey].push(nestedItem[1]);
      continue;
    }

    const fieldMatch = line.match(/^-\s+([a-zA-Z0-9_]+):\s*(.*)$/);
    if (fieldMatch) {
      const [, key, val] = fieldMatch;
      if (val.trim() === "") {
        activeListKey = key;
        current.lists[key] = [];
      } else {
        activeListKey = null;
        current.fields[key] = val.trim();
      }
    }
  }

  if (current) entries.push(current);
  return entries;
}

function parseSimpleList(sectionBody: string): string[] {
  return sectionBody
    .split(/\r?\n/)
    .map((l) => l.match(/^-\s+(.+?)\s*$/)?.[1] ?? "")
    .filter(Boolean);
}

export function loadProfile(): Profile {
  const filePath = resolve(process.cwd(), "PROFILE.md");
  const raw = readFileSync(filePath, "utf8");
  const { meta, body } = parseFrontmatter(raw);
  const sections = splitSections(body);

  const ventures: Venture[] = parseEntries(sections.get("Ventures") ?? "").map(
    (e) => ({
      name: e.heading,
      role: e.fields.role ?? "",
      period: e.fields.period ?? "",
      location: e.fields.location ?? "",
      url: e.fields.url ?? "",
      summary: e.fields.summary ?? "",
    }),
  );

  const experience: ExperienceItem[] = parseEntries(
    sections.get("Experience") ?? "",
  ).map((e) => ({
    company: e.heading,
    role: e.fields.role ?? "",
    period: e.fields.period ?? "",
    location: e.fields.location ?? "",
    subroles: (e.lists.subroles ?? []).map((item) => {
      const [title, period = ""] = item.split("|").map((s) => s.trim());
      return { title, period };
    }),
    bullets: e.lists.bullets ?? [],
    projects: (e.lists.projects ?? []).map((item) => {
      const [title, url = "", summary = ""] = item
        .split("|")
        .map((s) => s.trim());
      return { title, url, summary };
    }),
  }));

  const education: EducationItem[] = parseEntries(
    sections.get("Education") ?? "",
  ).map((e) => ({
    institution: e.heading,
    degree: e.fields.degree ?? "",
    period: e.fields.period ?? "",
    notes: e.fields.notes,
  }));

  const publications: PublicationItem[] = parseEntries(
    sections.get("Publications") ?? "",
  ).map((e) => ({
    title: e.heading,
    venue: e.fields.venue ?? "",
    year: e.fields.year,
    url: e.fields.url,
  }));

  const press: PressItem[] = parseEntries(sections.get("Press") ?? "").map(
    (e) => ({
      title: e.heading,
      outlet: e.fields.outlet ?? "",
      date: e.fields.date ?? "",
      url: e.fields.url ?? "",
      summary: e.fields.summary ?? "",
    }),
  );

  const skills: SkillGroup[] = parseSimpleList(
    sections.get("Skills") ?? "",
  ).map((line) => {
    const idx = line.indexOf(":");
    if (idx === -1) return { category: "Skills", items: [line] };
    return {
      category: line.slice(0, idx).trim(),
      items: line
        .slice(idx + 1)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    };
  });

  return {
    name: meta.name ?? "",
    fullName: meta.fullName ?? meta.name ?? "",
    brand: meta.brand ?? "ligouras",
    headline: meta.headline ?? "",
    location: meta.location ?? "",
    website: meta.website ?? "",
    github: meta.github ?? "",
    githubUsername: meta.githubUsername ?? "",
    linkedin: meta.linkedin ?? "",
    x: meta.x ?? "",
    summary: meta.summary ?? "",
    ventures,
    experience,
    education,
    publications,
    press,
    certifications: parseSimpleList(sections.get("Certifications") ?? ""),
    honors: parseSimpleList(sections.get("Honors") ?? ""),
    skills,
    languages: parseSimpleList(sections.get("Languages") ?? ""),
  };
}
