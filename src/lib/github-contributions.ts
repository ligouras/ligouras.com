export type ContributionLevel = 0 | 1 | 2 | 3 | 4;

export interface ContributionDay {
  date: string;
  count: number;
  level: ContributionLevel;
}

export interface ContributionWeek {
  days: (ContributionDay | null)[];
}

export interface ContributionSummary {
  username: string;
  totalContributions: number;
  activeDays: number;
  longestStreak: number;
  currentStreak: number;
  weeks: ContributionWeek[];
  monthLabels: { label: string; weekIndex: number }[];
  fetchedAt: string;
  source: "graphql" | "public" | "fallback";
}

const LEVEL_MAP: Record<string, ContributionLevel> = {
  NONE: 0,
  FIRST_QUARTILE: 1,
  SECOND_QUARTILE: 2,
  THIRD_QUARTILE: 3,
  FOURTH_QUARTILE: 4,
};

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function computeStats(days: ContributionDay[]): {
  activeDays: number;
  longestStreak: number;
  currentStreak: number;
} {
  let activeDays = 0;
  let longestStreak = 0;
  let running = 0;

  for (const day of days) {
    const active = day.count > 0 || day.level > 0;
    if (active) {
      activeDays += 1;
      running += 1;
      if (running > longestStreak) longestStreak = running;
    } else {
      running = 0;
    }
  }

  // Current streak: count backwards from the latest day (allow today to be 0 if yesterday was active)
  let currentStreak = 0;
  let idx = days.length - 1;
  if (idx >= 0 && days[idx].count === 0 && days[idx].level === 0) {
    idx -= 1;
  }
  while (idx >= 0 && (days[idx].count > 0 || days[idx].level > 0)) {
    currentStreak += 1;
    idx -= 1;
  }

  return { activeDays, longestStreak, currentStreak };
}

function buildWeeksAndMonths(days: ContributionDay[]): {
  weeks: ContributionWeek[];
  monthLabels: { label: string; weekIndex: number }[];
} {
  if (days.length === 0) return { weeks: [], monthLabels: [] };

  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const allWeeks: ContributionWeek[] = [];

  const firstDate = new Date(`${sorted[0].date}T00:00:00Z`);
  const leadingEmpty = firstDate.getUTCDay(); // 0 = Sunday
  let currentWeek: (ContributionDay | null)[] = Array(leadingEmpty).fill(null);

  for (const day of sorted) {
    currentWeek.push(day);
    if (currentWeek.length === 7) {
      allWeeks.push({ days: currentWeek });
      currentWeek = [];
    }
  }
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) currentWeek.push(null);
    allWeeks.push({ days: currentWeek });
  }

  // Show the last 52 weeks (12 clean months without repeating the boundary month)
  const weeks = allWeeks.slice(-52);

  const monthLabels: { label: string; weekIndex: number }[] = [];
  let lastMonth = -1;
  weeks.forEach((week, weekIndex) => {
    const firstValid = week.days.find((d): d is ContributionDay => d !== null);
    if (!firstValid) return;
    const month = new Date(`${firstValid.date}T00:00:00Z`).getUTCMonth();
    if (month !== lastMonth) {
      const prev = monthLabels[monthLabels.length - 1];
      // Replace a 1-week leading stub so Dec doesn't collide with a trailing Nov day
      if (prev && weekIndex - prev.weekIndex <= 2 && prev.weekIndex === 0) {
        monthLabels[monthLabels.length - 1] = {
          label: MONTH_NAMES[month],
          weekIndex,
        };
      } else if (!prev || weekIndex - prev.weekIndex >= 3) {
        monthLabels.push({ label: MONTH_NAMES[month], weekIndex });
      }
      lastMonth = month;
    }
  });

  return { weeks, monthLabels };
}

function finalizeSummary(
  username: string,
  days: ContributionDay[],
  totalContributions: number,
  source: ContributionSummary["source"],
): ContributionSummary {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const { activeDays, longestStreak, currentStreak } = computeStats(sorted);
  const { weeks, monthLabels } = buildWeeksAndMonths(sorted);

  return {
    username,
    totalContributions,
    activeDays,
    longestStreak,
    currentStreak,
    weeks,
    monthLabels,
    fetchedAt: new Date().toISOString().slice(0, 10),
    source,
  };
}

async function fetchViaGraphQL(
  username: string,
  token: string,
): Promise<ContributionSummary> {
  const query = `
    query($login: String!) {
      user(login: $login) {
        contributionsCollection {
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                date
                contributionCount
                contributionLevel
              }
            }
          }
        }
      }
    }
  `;

  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "ligouras.com-astro-build",
    },
    body: JSON.stringify({ query, variables: { login: username } }),
  });

  if (!response.ok) {
    throw new Error(`GitHub GraphQL returned ${response.status}`);
  }

  const payload = (await response.json()) as {
    data?: {
      user?: {
        contributionsCollection?: {
          contributionCalendar?: {
            totalContributions: number;
            weeks: {
              contributionDays: {
                date: string;
                contributionCount: number;
                contributionLevel: string;
              }[];
            }[];
          };
        };
      };
    };
    errors?: { message: string }[];
  };

  if (payload.errors?.length) {
    throw new Error(payload.errors.map((e) => e.message).join("; "));
  }

  const cal = payload.data?.user?.contributionsCollection?.contributionCalendar;
  if (!cal) {
    throw new Error("Missing contributionCalendar in GraphQL response");
  }

  const days: ContributionDay[] = cal.weeks.flatMap((w) =>
    w.contributionDays.map((d) => ({
      date: d.date,
      count: d.contributionCount,
      level: LEVEL_MAP[d.contributionLevel] ?? 0,
    })),
  );

  return finalizeSummary(username, days, cal.totalContributions, "graphql");
}

function parsePublicHtml(
  username: string,
  html: string,
): ContributionSummary {
  const tooltipCounts = new Map<string, number>();
  const tooltipRegex = /<tool-tip[^>]*\bfor="([^"]+)"[^>]*>([\s\S]*?)<\/tool-tip>/g;
  for (const match of html.matchAll(tooltipRegex)) {
    const id = match[1];
    const text = match[2].trim();
    if (/^No contributions?/i.test(text)) {
      tooltipCounts.set(id, 0);
    } else {
      const countMatch = text.match(/^([\d,]+)\s+contributions?/i);
      tooltipCounts.set(
        id,
        countMatch ? Number.parseInt(countMatch[1].replace(/,/g, ""), 10) : 0,
      );
    }
  }

  const days: ContributionDay[] = [];
  const tdRegex = /<td\b([^>]*)>/g;
  for (const match of html.matchAll(tdRegex)) {
    const attrs = match[1];
    const dateMatch = attrs.match(/\bdata-date="(\d{4}-\d{2}-\d{2})"/);
    if (!dateMatch) continue;
    const levelMatch = attrs.match(/\bdata-level="([0-4])"/);
    const idMatch = attrs.match(/\bid="([^"]+)"/);

    const level = (
      levelMatch ? Number.parseInt(levelMatch[1], 10) : 0
    ) as ContributionLevel;
    const count = idMatch ? (tooltipCounts.get(idMatch[1]) ?? 0) : 0;

    days.push({
      date: dateMatch[1],
      count,
      level,
    });
  }

  if (days.length === 0) {
    throw new Error("No contribution day cells parsed from GitHub HTML");
  }

  const totalMatch = html.match(
    /([\d,]+)\s+contributions?\s+in\s+the\s+last\s+year/i,
  );
  const summed = days.reduce((acc, d) => acc + d.count, 0);
  const totalContributions = totalMatch
    ? Number.parseInt(totalMatch[1].replace(/,/g, ""), 10)
    : summed;

  return finalizeSummary(username, days, totalContributions, "public");
}

async function fetchViaPublicPage(
  username: string,
): Promise<ContributionSummary> {
  const response = await fetch(
    `https://github.com/users/${encodeURIComponent(username)}/contributions`,
    {
      headers: {
        "User-Agent": "ligouras.com-astro-build",
        Accept: "text/html",
      },
    },
  );

  if (!response.ok) {
    throw new Error(`GitHub public contributions returned ${response.status}`);
  }

  const html = await response.text();
  return parsePublicHtml(username, html);
}

function buildFallbackSummary(username: string): ContributionSummary {
  // Deterministic 52-week empty grid fallback for offline sandbox builds
  const today = new Date();
  const days: ContributionDay[] = [];
  for (let i = 364; i >= 0; i -= 1) {
    const d = new Date(today.getTime() - i * 86_400_000);
    days.push({
      date: d.toISOString().slice(0, 10),
      count: 0,
      level: 0,
    });
  }
  return finalizeSummary(username, days, 0, "fallback");
}

export async function getGitHubContributions(
  username: string,
): Promise<ContributionSummary> {
  const token =
    process.env.GH_CONTRIBUTIONS_TOKEN || process.env.GITHUB_TOKEN || "";

  if (token) {
    try {
      return await fetchViaGraphQL(username, token);
    } catch (err) {
      console.warn(
        `[github-contributions] GraphQL fetch failed, trying public HTML:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  try {
    return await fetchViaPublicPage(username);
  } catch (err) {
    console.warn(
      `[github-contributions] Public fetch failed, using offline fallback:`,
      err instanceof Error ? err.message : err,
    );
    return buildFallbackSummary(username);
  }
}
