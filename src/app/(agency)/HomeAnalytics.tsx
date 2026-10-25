"use client";

// The home page's analytics: its key figures, how the requests were qualified, where the proposals stand,
// the spaces side by side, and the register of every request (BrowserView.tsx HomePage).

import { useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, ArrowUpRight, ChevronLeft, ChevronRight, Clock, Gift, HandCoins, Inbox, Info, Layers, ReceiptText, Search, SearchX, type LucideIcon } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, XAxis, YAxis } from "recharts";
import { Hint } from "@/components/hint";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { outsideStatuses, outsideStatusView, type OutsideStatus } from "@/lib/outsideStatus";
import { StatusPill } from "./editor/EditorInspector";
import { ColumnLabel } from "./ProjectTracking";

/** Scope and proposal analytics (formerly the deliverable dashboard) for a set of deliverables. */
export type HomeAnalyticsData = {
  totalDemands: number;
  included: number;
  outside: number;
  pending: number;
  quotedEuros: number;
  acceptedEuros: number;
  acceptedDays: number;
  acceptedCount: number;
  refusedCount: number;
  refusedEuros: number;
  awaitingCount: number;
  awaitingEuros: number;
  /** Out-of-scope requests offered to the client, and what they are worth (src/lib/requestOffer.ts). */
  offeredCount: number;
  offeredEuros: number;
  versions: number;
  register: {
    id: number;
    livrable: string;
    version: string;
    message: string;
    decision: "À qualifier" | "Inclus" | "Hors périmètre";
    /** Its quote's amount, or its offer's value. */
    amount?: string;
    /** The same as a number, to sort by. */
    amountValue?: number;
    deadline?: string;
    /** Where its proposal stands (src/lib/outsideStatus.ts): out-of-scope requests only. */
    status: OutsideStatus | null;
    href: string;
  }[];
};

/** French typography: a non-breaking space before the euro sign, so it never starts a line. */
const nbsp = String.fromCharCode(0xa0);
const euros = (value: number) => `${value.toLocaleString("fr-FR")}${nbsp}€`;
const share = (count: number, total: number) => `${Math.round((count / Math.max(total, 1)) * 100)} %`;

// ——— Key figures ———

export type KeyFigure = { label: string; value: string; icon: LucideIcon };

/** The section's figures: the revenue the out-of-scope work brought, then a few others, a word each. */
export function KeyFigures({ hero, tiles }: { hero: KeyFigure & { note: string }; tiles: KeyFigure[] }) {
  return (
    <div className="overview grid gap-3 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <Card className="hero-stat justify-center gap-2 border-[var(--status-resolved-bg)] bg-[var(--status-resolved-bg)] px-5 py-5 shadow-none">
        <span className="flex items-center gap-1.5 text-xs font-medium text-[var(--status-resolved-text)]">
          <hero.icon aria-hidden="true" className="size-3.5" /> {hero.label}
        </span>
        <span className="text-4xl font-semibold tracking-tight tabular-nums text-[var(--status-resolved-text)]">{hero.value}</span>
        <span className="text-xs text-[var(--status-resolved-text)]">{hero.note}</span>
      </Card>
      <div className="grid grid-cols-2 gap-3 @xl:grid-cols-3">
        {tiles.map((tile) => (
          <Card key={tile.label} className="stat-tile gap-1 px-4 py-3.5 shadow-none" role="group" aria-label={tile.label}>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <tile.icon aria-hidden="true" className="size-3.5 shrink-0" /> {tile.label}
            </span>
            <span className="text-xl font-semibold tabular-nums">{tile.value}</span>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ——— Charts ———

// The qualifications keep their pins' colours (palette checked with the dataviz validator, light surface).
// The proposals' columns are named by their status under each one: one colour for all, none needed to tell
// them apart. Every column carries its figure as text: colour never says something alone.
const scopeConfig = {
  included: { label: "Inclus", color: "var(--mark-included)" },
  outside: { label: "Hors scope", color: "var(--mark-outside)" },
  pending: { label: "À clarifier", color: "var(--mark-clarify)" },
} satisfies ChartConfig;

/** A column: its name, what is written above it, what its hover says, its colour; its height is `count`. */
type Slice = { key: string; label: string; count: number; text: string; detail: string; fill: string };

/** At most this many letters on a line under a column: seven columns side by side in a narrow card. */
const tickLine = 11;

/** A column's name under it, in short lines (« Contre-proposition reçue » breaks after its hyphen): never over its neighbour's. */
function AxisTick({ x, y, payload }: { x?: number | string; y?: number | string; payload?: { value?: unknown } }) {
  const pieces = String(payload?.value ?? "").split(/(?<=-)|\s+/).filter(Boolean);
  const lines = pieces.reduce<string[]>((built, piece) => {
    const last = built.at(-1);
    if (last !== undefined && `${last} ${piece}`.length <= tickLine) built[built.length - 1] = last.endsWith("-") ? `${last}${piece}` : `${last} ${piece}`;
    else built.push(piece);
    return built;
  }, []);
  return (
    <text x={Number(x)} y={Number(y) + 10} textAnchor="middle" fontSize={11} className="fill-muted-foreground">
      {lines.map((line, index) => (
        <tspan key={`${index}-${line}`} x={Number(x)} dy={index ? 13 : 0}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

/** The hovered column: its name, then what it counts and is worth. */
function SliceTooltip({ active, payload }: { active?: boolean; payload?: readonly { payload?: Slice }[] }) {
  const slice = payload?.[0]?.payload;
  if (!active || !slice) return null;
  return (
    <div className="grid min-w-32 gap-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs shadow-md">
      <div className="font-medium text-foreground">{slice.label}</div>
      <div className="flex items-center gap-2">
        <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: slice.fill }} aria-hidden="true" />
        <span className="tabular-nums text-foreground">{slice.detail}</span>
      </div>
    </div>
  );
}

/** One column per slice, its figure above it: a part of a whole, read at a glance, the detail on hover. */
function SliceColumns({ slices, label }: { slices: Slice[]; label: string }) {
  return (
    <ChartContainer
      config={{}}
      className="aspect-auto h-[236px] w-full"
      role="img"
      aria-label={`${label} : ${slices.map((slice) => `${slice.label}, ${slice.detail}`).join(" ; ")}`}
    >
      <BarChart data={slices} margin={{ left: 0, right: 0, top: 20, bottom: 0 }} barCategoryGap="22%">
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} interval={0} height={50} tick={<AxisTick />} />
        <YAxis hide allowDecimals={false} domain={[0, (max: number) => Math.max(1, max)]} />
        <ChartTooltip cursor={false} content={<SliceTooltip />} />
        <Bar dataKey="count" radius={[4, 4, 0, 0]} minPointSize={2} maxBarSize={64} isAnimationActive={false}>
          {slices.map((slice) => (
            <Cell key={slice.key} fill={slice.fill} />
          ))}
          <LabelList dataKey="text" content={(props) => <ColumnLabel x={props.x} y={props.y} width={props.width} value={props.value} />} />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

/** A figure under a chart: a small tile, its icon, what it counts (said in full on hover), then its value. */
function Fact({ label, value, icon: Icon, about }: { label: string; value: string; icon: LucideIcon; about: string }) {
  return (
    <div className="grid content-start gap-1 rounded-lg bg-muted/70 px-3 py-2.5">
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon aria-hidden="true" className="size-3.5 shrink-0" />
        <span className="min-w-0">{label}</span>
        <Hint label={about} side="top">
          <button type="button" className="ml-auto grid size-4 shrink-0 place-items-center rounded-full text-muted-foreground hover:text-foreground" aria-label={`${label} : ${about}`}>
            <Info aria-hidden="true" className="size-3.5" />
          </button>
        </Hint>
      </dt>
      <dd className="m-0 text-base font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

const demandes = (count: number) => `${count} demande${count > 1 ? "s" : ""}`;

/** How the requests were qualified against the quote. */
export function ScopeChart({ data }: { data: HomeAnalyticsData }) {
  const { totalDemands, included, outside, pending } = data;
  const counts = { included, outside, pending };
  const slices: Slice[] = (["included", "outside", "pending"] as const).map((key) => ({
    key,
    label: scopeConfig[key].label,
    count: counts[key],
    text: share(counts[key], totalDemands),
    detail: `${demandes(counts[key])} · ${share(counts[key], totalDemands)}`,
    fill: scopeConfig[key].color,
  }));
  return (
    <Card className="shadow-none">
      <CardContent>
        <SliceColumns slices={slices} label="Demandes par qualification" />
      </CardContent>
      <CardFooter>
        <dl className="m-0 grid w-full grid-cols-2 gap-2 @2xl:grid-cols-4">
          <Fact icon={Inbox} label="Demandes qualifiées" value={String(totalDemands)} about="Les demandes classées Inclus, Hors scope ou À clarifier." />
          <Fact icon={ReceiptText} label="Devis moyen" value={euros(outside > 0 ? Math.round(data.quotedEuros / outside) : 0)} about="Le montant moyen des propositions chiffrées." />
          <Fact icon={Layers} label="Versions totales" value={String(data.versions)} about="Toutes les versions des livrables, la première comprise." />
          <Fact
            icon={Clock}
            label="Temps non facturé évité"
            value={`~${data.acceptedDays * 7} h`}
            about="Les jours de délai des devis acceptés, à 7 h par jour : du travail qui aurait été fait sans être payé."
          />
        </dl>
      </CardFooter>
    </Card>
  );
}

/** Where the out-of-scope requests' proposals stand, status by status as in the editor and the register. */
export function ProposalChart({ data }: { data: HomeAnalyticsData }) {
  const outside = data.register.filter((row) => row.status);
  const slices: Slice[] = outsideStatuses.map((status) => {
    const rows = outside.filter((row) => row.status === status);
    const amount = rows.reduce((total, row) => total + (row.amountValue ?? 0), 0);
    return {
      key: status,
      label: outsideStatusView(status, "agency").label ?? status,
      count: rows.length,
      text: String(rows.length),
      detail: `${rows.length} proposition${rows.length > 1 ? "s" : ""}${status === "unquoted" ? "" : ` · ${euros(amount)}`}`,
      fill: "var(--action-ui)",
    };
  });
  return (
    <Card className="shadow-none">
      <CardContent>
        <SliceColumns slices={slices} label="Demandes hors scope par état de leur proposition" />
      </CardContent>
      <CardFooter>
        <dl className="m-0 grid w-full grid-cols-2 gap-2 @2xl:grid-cols-4">
          <Fact icon={ReceiptText} label="Total chiffré" value={euros(data.quotedEuros)} about="La somme des propositions chiffrées, envoyées ou non." />
          <Fact icon={HandCoins} label="Valeur capturée" value={`+${euros(data.acceptedEuros)}`} about="La somme des devis acceptés par le client." />
          <Fact icon={Gift} label="Offert au client" value={euros(data.offeredEuros)} about="La valeur des offres envoyées : du travail fait sans être facturé." />
          <Fact icon={Clock} label="Délai accordé" value={data.acceptedDays ? `+${data.acceptedDays} j` : "aucun"} about="Les jours ajoutés au planning par les devis acceptés." />
        </dl>
      </CardFooter>
    </Card>
  );
}

// ——— Tables ———

type Direction = "asc" | "desc";
type Sort<K extends string> = { key: K; direction: Direction } | null;

/** A column's sort, clicked through: its first direction, the other, then the table's own order. */
function useSort<K extends string>() {
  const [sort, setSort] = useState<Sort<K>>(null);
  const toggle = (key: K, first: Direction = "asc") =>
    setSort((current) => {
      if (current?.key !== key) return { key, direction: first };
      return current.direction === first ? { key, direction: first === "asc" ? "desc" : "asc" } : null;
    });
  return { sort, toggle };
}

/** Rows in the sort's order (values left undefined last, either way); the given order without a sort. */
function sorted<T, K extends string>(rows: T[], sort: Sort<K>, valueOf: (row: T, key: K) => string | number | undefined) {
  if (!sort) return rows;
  const sign = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort((left, right) => {
    const [a, b] = [valueOf(left, sort.key), valueOf(right, sort.key)];
    if (a === undefined || b === undefined) return a === b ? 0 : a === undefined ? 1 : -1;
    return sign * (typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), "fr"));
  });
}

/** A column title that sorts its table, saying how it is sorted (aria-sort). */
function SortableHead<K extends string>({
  label,
  column,
  sort,
  onSort,
  first = "asc",
  className,
}: {
  label: string;
  column: K;
  sort: Sort<K>;
  onSort: (key: K, first?: Direction) => void;
  first?: Direction;
  className?: string;
}) {
  const direction = sort?.key === column ? sort.direction : undefined;
  const Icon = direction === "asc" ? ArrowUp : direction === "desc" ? ArrowDown : ArrowUpDown;
  return (
    <TableHead className={className} aria-sort={direction === "asc" ? "ascending" : direction === "desc" ? "descending" : "none"}>
      <Button variant="ghost" size="sm" className="-mx-2 h-7 px-2 text-xs font-medium text-muted-foreground hover:text-foreground" onClick={() => onSort(column, first)}>
        {label}
        <Icon aria-hidden="true" className={direction ? "text-foreground" : "opacity-50"} />
      </Button>
    </TableHead>
  );
}

type RegisterRow = HomeAnalyticsData["register"][number];
type Qualification = "pending" | "included" | "outside";
// An older « À traiter » in the base reads « À clarifier », as everywhere.
const qualificationOf = (row: RegisterRow): Qualification => (row.decision === "Inclus" ? "included" : row.decision === "Hors périmètre" ? "outside" : "pending");
const qualifications: Record<Qualification, { label: string; badge: string }> = {
  pending: { label: "À clarifier", badge: "decision-pending" },
  included: { label: "Inclus", badge: "decision-included" },
  outside: { label: "Hors scope", badge: "decision-outside" },
};
type RegisterColumn = "request" | "livrable" | "version" | "qualification" | "amount" | "proposal";
const registerValue = (row: RegisterRow, column: RegisterColumn) =>
  column === "request"
    ? row.message
    : column === "livrable"
      ? row.livrable
      : column === "version"
        ? row.version
        : column === "qualification"
          ? Object.keys(qualifications).indexOf(qualificationOf(row))
          : column === "amount"
            ? row.amountValue
            : row.status
              ? outsideStatuses.indexOf(row.status)
              : undefined;
/** Searched without case or accents: « equipe » finds « Équipe ». */
const folded = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

const pageSizes = [5, 10, 20, 40];
type RegisterFilters = { query: string; qualification: Qualification | "all"; proposal: OutsideStatus | "all" };
const noFilters: RegisterFilters = { query: "", qualification: "all", proposal: "all" };

/** A text cut short in its cell (two lines, or one), whole on hover and for screen readers. */
const Clipped = ({ text, lines, className }: { text: string; lines: 1 | 2; className: string }) => (
  <Hint label={text} side="top">
    <span className={`${lines === 2 ? "line-clamp-2 whitespace-normal" : "block truncate"} ${className}`}>{text}</span>
  </Hint>
);

/** Every request with its qualification and its proposal: searched, filtered, sorted, five at a time. */
export function RegisterTable({ rows }: { rows: RegisterRow[] }) {
  const [filters, setFilters] = useState<RegisterFilters>(noFilters);
  const { sort, toggle } = useSort<RegisterColumn>();
  const [pageSize, setPageSize] = useState(pageSizes[0]);
  const [pageIndex, setPageIndex] = useState(0);
  // A new search, filter or sort starts again from the first page.
  const filter = (next: Partial<RegisterFilters>) => {
    setFilters((current) => ({ ...current, ...next }));
    setPageIndex(0);
  };
  const sortBy = (column: RegisterColumn, first?: Direction) => {
    toggle(column, first);
    setPageIndex(0);
  };
  if (rows.length === 0) return <p className="browser-empty">Aucune demande pour ces livrables.</p>;

  const query = folded(filters.query.trim());
  const matching = rows.filter(
    (row) =>
      (filters.qualification === "all" || qualificationOf(row) === filters.qualification) &&
      (filters.proposal === "all" || row.status === filters.proposal) &&
      (!query || folded(`${row.message} ${row.livrable}`).includes(query)),
  );
  const ordered = sorted(matching, sort, registerValue);
  const pageCount = Math.max(1, Math.ceil(ordered.length / pageSize));
  // A narrower section filter can leave the current page empty: show the last one.
  const page = Math.min(pageIndex, pageCount - 1);
  const shown = ordered.slice(page * pageSize, (page + 1) * pageSize);
  const filtered = filters.query !== "" || filters.qualification !== "all" || filters.proposal !== "all";

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1 sm:max-w-72">
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={filters.query}
            onChange={(event) => filter({ query: event.target.value })}
            placeholder="Rechercher une demande, un livrable…"
            aria-label="Rechercher dans le registre"
            className="h-8 pl-8"
          />
        </div>
        <Select value={filters.qualification} onValueChange={(value) => filter({ qualification: value as RegisterFilters["qualification"] })}>
          <SelectTrigger aria-label="Qualification" className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value="all">Toutes qualifications</SelectItem>
            {(Object.keys(qualifications) as Qualification[]).map((key) => (
              <SelectItem key={key} value={key}>
                {qualifications[key].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.proposal} onValueChange={(value) => filter({ proposal: value as RegisterFilters["proposal"] })}>
          <SelectTrigger aria-label="Proposition" className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value="all">Toutes propositions</SelectItem>
            {outsideStatuses.map((status) => (
              <SelectItem key={status} value={status}>
                {outsideStatusView(status, "agency").label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {filtered && (
          <Button variant="ghost" className="h-8" onClick={() => filter(noFilters)}>
            Effacer les filtres
          </Button>
        )}
      </div>

      {matching.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchX aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>Aucune demande ne correspond</EmptyTitle>
            <EmptyDescription>Essayez d’autres mots, une autre qualification ou un autre état de proposition.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <SortableHead label="Demande" column="request" sort={sort} onSort={sortBy} />
              <SortableHead label="Livrable" column="livrable" sort={sort} onSort={sortBy} />
              <SortableHead label="Version" column="version" sort={sort} onSort={sortBy} />
              <SortableHead label="Qualification" column="qualification" sort={sort} onSort={sortBy} />
              <SortableHead label="Chiffrage" column="amount" sort={sort} onSort={sortBy} first="desc" className="text-right" />
              <SortableHead label="Proposition" column="proposal" sort={sort} onSort={sortBy} />
              <TableHead className="w-10">
                <span className="sr-only">Ouvrir</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((row) => {
              const qualification = qualifications[qualificationOf(row)];
              const proposal = row.status ? outsideStatusView(row.status, "agency") : null;
              return (
                <TableRow key={row.id}>
                  <TableHead scope="row" className="h-auto py-2.5 text-sm font-medium text-foreground">
                    <Clipped text={row.message} lines={2} className="max-w-72 min-w-48" />
                  </TableHead>
                  <TableCell>
                    <Clipped text={row.livrable} lines={1} className="max-w-40" />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{row.version}</TableCell>
                  <TableCell>
                    <span className={`decision-badge ${qualification.badge}`}>{qualification.label}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    {row.amount ? (
                      // The amount alone; its delay on hover.
                      <Hint label={row.deadline ? `Délai : ${row.deadline}` : "Sans délai"} side="top">
                        <span>{row.amount}</span>
                      </Hint>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>{proposal?.label ? <StatusPill label={proposal.label} tone={proposal.tone} /> : <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="text-right">
                    <Hint label="Ouvrir la demande" side="left">
                      <Button variant="ghost" size="icon-sm" asChild>
                        <Link href={row.href} aria-label={`Ouvrir la demande « ${row.message} »`}>
                          <ArrowUpRight aria-hidden="true" />
                        </Link>
                      </Button>
                    </Hint>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {matching.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Label htmlFor="register-page-size" className="text-sm font-normal text-muted-foreground">
              Lignes par page
            </Label>
            <Select
              value={String(pageSize)}
              onValueChange={(value) => {
                setPageSize(Number(value));
                setPageIndex(0);
              }}
            >
              <SelectTrigger id="register-page-size" className="w-20">
                <SelectValue />
              </SelectTrigger>
              {/* At the foot of the page: a popover, which opens upwards when there is no room below. */}
              <SelectContent position="popper">
                {pageSizes.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-4">
          <span className="text-sm text-muted-foreground" aria-live="polite">
            {page * pageSize + 1}–{page * pageSize + shown.length} sur {ordered.length}
            {filtered ? ` (${rows.length} au total)` : ""}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon-sm" aria-label="Page précédente" disabled={page === 0} onClick={() => setPageIndex(page - 1)}>
              <ChevronLeft />
            </Button>
            <span className="min-w-20 text-center text-sm">
              Page {page + 1} / {pageCount}
            </span>
            <Button variant="outline" size="icon-sm" aria-label="Page suivante" disabled={page >= pageCount - 1} onClick={() => setPageIndex(page + 1)}>
              <ChevronRight />
            </Button>
          </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** A row of the breakdown by space (or by deliverable): its own counts, then what is left, out of scope, earned. */
export type BreakdownRow = { key: string; label: string; href: string; avatar?: React.ReactNode; counts: number[]; toQualify: number; outside: number; acceptedEuros: number };
type BreakdownColumn = "label" | `count${number}` | "toQualify" | "outside" | "acceptedEuros";
const breakdownValue = (row: BreakdownRow, column: BreakdownColumn) =>
  column === "label" ? row.label : column.startsWith("count") ? row.counts[Number(column.slice(5))] : row[column as "toQualify" | "outside" | "acceptedEuros"];

/** Spaces (or the deliverables chosen) side by side, sorted by any column. */
export function BreakdownTable({ columns, rows }: { columns: string[]; rows: BreakdownRow[] }) {
  const { sort, toggle } = useSort<BreakdownColumn>();
  if (rows.length === 0) return <p className="browser-empty">Aucun livrable sélectionné.</p>;
  const [first, ...counts] = columns;
  const figures: { label: string; column: BreakdownColumn }[] = [
    ...counts.map((label, index) => ({ label, column: `count${index}` as BreakdownColumn })),
    { label: "À clarifier", column: "toQualify" },
    { label: "Hors scope", column: "outside" },
    { label: "Revenu accepté", column: "acceptedEuros" },
  ];
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <SortableHead label={first} column="label" sort={sort} onSort={toggle} />
          {figures.map((figure) => (
            // Figures read biggest first.
            <SortableHead key={figure.column} label={figure.label} column={figure.column} sort={sort} onSort={toggle} first="desc" className="text-right" />
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted(rows, sort, breakdownValue).map((row) => (
          <TableRow key={row.key}>
            <TableHead scope="row" className="h-auto py-2.5 text-sm text-foreground">
              <Link href={row.href} className="inline-flex items-center gap-2 font-medium text-foreground no-underline hover:underline">
                {row.avatar}
                <span>{row.label}</span>
              </Link>
            </TableHead>
            {row.counts.map((count, index) => (
              <TableCell key={index} className="text-right">
                {count}
              </TableCell>
            ))}
            <TableCell className="text-right">{row.toQualify}</TableCell>
            <TableCell className="text-right">{row.outside}</TableCell>
            <TableCell className="text-right">{euros(row.acceptedEuros)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
