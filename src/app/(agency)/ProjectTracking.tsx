"use client";

// The « Suivi » tab of a project, for the agency to see what Kora brings it: four figures for the whole
// project (what the out-of-scope work earned, its share of the requests, the round trips, how fast the team
// answers), then the out-of-scope requests from found to accepted, each deliverable's versions, the requests
// version after version, and the requests over time. Each section has its own filters (a deliverable, a
// period), where they mean something. Computed by trackingData.ts; drawn with shadcn's charts. Every bar
// carries its value as text: colour never says something alone (palettes checked with the dataviz validator).

import { useState } from "react";
import Link from "next/link";
import { CalendarDays, FunnelX, GitCompareArrows, HandCoins, Layers, Repeat, ShieldCheck, Timer } from "lucide-react";
import { Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { euros } from "@/lib/projectScope";
import { useNow } from "./editor/CanvasComments";
import { projectTracking, trackingPeriods, type LivrableTracking, type TrackingPeriod } from "./trackingData";
import { href } from "./routes";
import "./projectTracking.css";

const percent = (part: number, whole: number) => `${Math.round((part / Math.max(whole, 1)) * 100)} %`;
const plural = (count: number, word: string, many = `${word}s`) => `${count} ${count > 1 ? many : word}`;
const versionName = (version: number) => `V${String(version).padStart(2, "0")}`;
const dayLabel = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
const bucketLabel = (iso: string, unit: "week" | "month") =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", unit === "month" ? { month: "short", year: "2-digit" } : { day: "numeric", month: "short" });
const decimal = (value: number) => value.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
/** A deliverable's name kept short in a chart's axis; the whole name is in the tooltip. */
const shortName = (name: string, max = 22) => (name.length > max ? `${name.slice(0, max - 1)}…` : name);

/** A delay as one reads it: minutes, hours, then days. */
function duration(ms: number) {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${Math.max(minutes, 1)} min`;
  const hours = ms / 3_600_000;
  return hours < 48 ? `${decimal(Math.round(hours * 10) / 10)} h` : `${decimal(Math.round((hours / 24) * 10) / 10)} j`;
}

// Kora's marks: the qualifications keep the colours of their pins.
const requestConfig = {
  included: { label: "Inclus", color: "var(--mark-included)" },
  outside: { label: "Hors scope", color: "var(--mark-outside)" },
  pending: { label: "À clarifier", color: "var(--mark-clarify)" },
} satisfies ChartConfig;
const outsideConfig = { count: { label: "Demandes", color: "var(--mark-outside)" } } satisfies ChartConfig;
const versionsConfig = { versions: { label: "Versions", color: "var(--action-ui)" } } satisfies ChartConfig;
const versionConfig = { requests: { label: "Demandes", color: "var(--action-ui)" } } satisfies ChartConfig;

/** What the tab is computed from (trackingData.ts), all but today and its filters. */
export type TrackingInput = Omit<Parameters<typeof projectTracking>[0], "now" | "livrableId" | "period">;
type Filters = { livrable: string; period: TrackingPeriod };
const allFilters: Filters = { livrable: "all", period: "all" };
const tracked = (input: TrackingInput, now: number, filters: Filters = allFilters) =>
  projectTracking({ ...input, now, period: filters.period, livrableId: filters.livrable === "all" ? undefined : Number(filters.livrable) });

/** One figure of the project: its label and icon, its value. */
function Figure({ label, value, icon: Icon }: { label: string; value: string; icon: typeof HandCoins }) {
  return (
    <div className="tracking-figure" role="group" aria-label={label}>
      <span className="tracking-figure-label">
        <Icon aria-hidden="true" /> {label}
      </span>
      <span className="tracking-figure-value">{value}</span>
    </div>
  );
}

function Panel({ title, description, action, children }: { title: string; description?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card role="region" aria-label={title}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        {action && <CardAction className="tracking-filters">{action}</CardAction>}
      </CardHeader>
      <CardContent className="grid gap-3">{children}</CardContent>
    </Card>
  );
}

/** A section with nothing to draw yet: what it will show, and the step that fills it, when there is one. */
function TrackingEmpty({ icon: Icon, title, children, action }: { icon: typeof HandCoins; title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{children}</EmptyDescription>
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  );
}

/** Narrowed to nothing: said as such, with the way back to the whole project. */
const FilteredEmpty = ({ title, onReset }: { title: string; onReset: () => void }) => (
  <TrackingEmpty
    icon={FunnelX}
    title={title}
    action={
      <Button variant="outline" size="sm" onClick={onReset}>
        Tout afficher
      </Button>
    }
  >
    Essayez un autre livrable ou une période plus longue.
  </TrackingEmpty>
);

/** A deliverable to choose, by its first version's id, in a field of fixed width: a long name is cut, whole in the list. */
function LivrableSelect({ label, value, livrables, onChange }: { label: string; value: string; livrables: LivrableTracking[]; onChange: (value: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger size="sm" aria-label={label} className="tracking-select">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Tous les livrables</SelectItem>
        {livrables.map((livrable) => (
          <SelectItem key={livrable.id} value={String(livrable.id)}>
            {livrable.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function PeriodSelect({ value, onChange }: { value: TrackingPeriod; onChange: (value: TrackingPeriod) => void }) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as TrackingPeriod)}>
      <SelectTrigger size="sm" aria-label="Période" className="tracking-select is-period">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(trackingPeriods) as TrackingPeriod[]).map((key) => (
          <SelectItem key={key} value={key}>
            {trackingPeriods[key]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** A section's filters, a deliverable and a period, kept by the section itself. */
function useFilters() {
  const [filters, setFilters] = useState<Filters>(allFilters);
  return {
    filters,
    filtered: filters.livrable !== allFilters.livrable || filters.period !== allFilters.period,
    reset: () => setFilters(allFilters),
    setLivrable: (livrable: string) => setFilters((current) => ({ ...current, livrable })),
    setPeriod: (period: TrackingPeriod) => setFilters((current) => ({ ...current, period })),
  };
}

export function ProjectTracking({ input }: { input: TrackingInput }) {
  const now = useNow();
  const whole = tracked(input, now);
  const { budget, requests, outside, livrables, response } = whole;
  const averageVersions = livrables.length ? livrables.reduce((total, item) => total + item.versions, 0) / livrables.length : 0;

  return (
    <div className="tracking">
      <Card className="tracking-figures">
        <Figure icon={HandCoins} label="Gagné grâce au hors scope" value={`${outside.accepted.amount ? "+" : ""}${euros(outside.accepted.amount)}`} />
        <Figure icon={ShieldCheck} label="Part des demandes hors scope" value={requests.total ? percent(requests.outside, requests.total) : "—"} />
        <Figure icon={Repeat} label="Versions par livrable, en moyenne" value={livrables.length ? decimal(averageVersions) : "—"} />
        <Figure icon={Timer} label="Délai de réponse de l’équipe" value={response.median !== undefined ? duration(response.median) : "—"} />
      </Card>

      <OutsideFunnel input={input} now={now} livrables={whole.allLivrables} budget={budget} />
      <RoundTrips livrables={livrables} projectId={input.projectId} />
      <Convergence livrables={whole.allLivrables} />
      <OverTime input={input} now={now} livrables={whole.allLivrables} />
    </div>
  );
}

/** Above each column, what it counts, then what it is worth: on two lines (Recharts' own label wraps at the column's width). */
function ColumnLabel({ x, y, width, value }: { x?: number | string; y?: number | string; width?: number | string; value?: unknown }) {
  const [count, amount] = String(value ?? "").split("|");
  const center = Number(x) + Number(width) / 2;
  return (
    <text x={center} y={Number(y) - (amount ? 24 : 8)} textAnchor="middle" fontSize={12}>
      <tspan x={center} className="fill-foreground" fontWeight={600}>
        {count}
      </tspan>
      {amount && (
        <tspan x={center} dy={16} className="fill-muted-foreground">
          {amount}
        </tspan>
      )}
    </text>
  );
}

/** The out-of-scope requests from found to accepted: where the paid work comes from, and where it is lost. */
function OutsideFunnel({ input, now, livrables, budget }: { input: TrackingInput; now: number; livrables: LivrableTracking[]; budget?: number }) {
  const { filters, filtered, reset, setLivrable, setPeriod } = useFilters();
  const { outside } = tracked(input, now, filters);
  const stages = [
    { stage: "Repérées", count: outside.found, label: plural(outside.found, "demande") },
    { stage: "Chiffrées", count: outside.quoted.count, label: `${plural(outside.quoted.count, "demande")}|${euros(outside.quoted.amount)}` },
    { stage: "Envoyées", count: outside.sent.count, label: `${plural(outside.sent.count, "demande")}|${euros(outside.sent.amount)}` },
    { stage: "Acceptées", count: outside.accepted.count, label: `${plural(outside.accepted.count, "demande")}|${euros(outside.accepted.amount)}` },
  ];
  return (
    <Panel
      title="Du hors scope au devis accepté"
      description={
        outside.accepted.amount
          ? `${euros(outside.accepted.amount)} de travail en plus payé${budget ? `, +${percent(outside.accepted.amount, budget)} du budget` : ""}`
          : "Chaque demande hors scope peut devenir un avenant payé."
      }
      action={
        <>
          <LivrableSelect label="Livrable" value={filters.livrable} livrables={livrables} onChange={setLivrable} />
          <PeriodSelect value={filters.period} onChange={setPeriod} />
        </>
      }
    >
      {outside.found === 0 && filtered ? (
        <FilteredEmpty title="Aucune demande hors scope sur ces filtres" onReset={reset} />
      ) : outside.found === 0 ? (
        <TrackingEmpty icon={HandCoins} title="Aucune demande hors scope pour l’instant">
          Qualifiez « Hors scope » une demande qui dépasse le devis : chiffrée puis envoyée au client, elle se suit ici jusqu’à l’avenant accepté.
        </TrackingEmpty>
      ) : (
        <div className="tracking-split">
          <ChartContainer
            config={outsideConfig}
            className="aspect-auto h-[240px] w-full"
            role="img"
            aria-label={stages.map((stage) => `${stage.stage} : ${stage.label.replace("|", ", ")}`).join(" ; ")}
          >
            <BarChart data={stages} margin={{ left: 0, right: 0, top: 44, bottom: 0 }} barCategoryGap="22%">
              <CartesianGrid vertical={false} />
              <XAxis dataKey="stage" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 12 }} />
              <YAxis hide allowDecimals={false} domain={[0, Math.max(1, outside.found)]} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
              <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} minPointSize={2} isAnimationActive={false}>
                <LabelList dataKey="label" content={(props) => <ColumnLabel x={props.x} y={props.y} width={props.width} value={props.value} />} />
              </Bar>
            </BarChart>
          </ChartContainer>
          {/* What is left to do, each with its figure. */}
          <dl className="tracking-notes">
            <div className={outside.unquoted ? "is-warn" : undefined}>
              <dt>À chiffrer</dt>
              <dd>{plural(outside.unquoted, "demande")}</dd>
            </div>
            <div>
              <dt>En attente du client</dt>
              <dd>{euros(outside.awaiting.amount)}</dd>
            </div>
            <div>
              <dt>Refusés</dt>
              <dd>{outside.refused.count ? euros(outside.refused.amount) : "Aucun"}</dd>
            </div>
          </dl>
        </div>
      )}
    </Panel>
  );
}

/** Each deliverable's versions, the most revised first: every new version is a round trip with the client. */
function RoundTrips({ livrables, projectId }: { livrables: LivrableTracking[]; projectId: number }) {
  const shown = livrables.slice(0, 10);
  const data = shown.map((livrable) => ({
    name: shortName(livrable.name),
    full: livrable.name,
    versions: livrable.versions,
    text: `${versionName(livrable.versions)}${livrable.approved ? " · validé" : ""}`,
  }));
  return (
    <Panel title="Allers-retours par livrable" description="Chaque nouvelle version d’un livrable est un aller-retour avec le client : du plus repris au moins repris.">
      {shown.length === 0 ? (
        <TrackingEmpty
          icon={Layers}
          title="Aucun livrable dans ce projet"
          action={
            <Button variant="outline" size="sm" asChild>
              <Link href={href.project(projectId)}>Aller aux livrables</Link>
            </Button>
          }
        >
          Importez un premier livrable : chacune de ses versions comptera ici comme un aller-retour avec le client.
        </TrackingEmpty>
      ) : (
        <ChartContainer
          config={versionsConfig}
          className="aspect-auto w-full"
          style={{ height: 24 + shown.length * 36 }}
          role="img"
          aria-label={data.map((item) => `${item.full} : ${plural(item.versions, "version")}`).join(", ")}
        >
          <BarChart data={data} layout="vertical" margin={{ left: 0, right: 96, top: 4, bottom: 0 }} barCategoryGap={8}>
            <XAxis type="number" hide allowDecimals={false} />
            <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={190} tick={{ fontSize: 12, width: 186 }} />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent labelFormatter={(_, payload) => String(payload[0]?.payload?.full ?? "")} valueFormatter={(value) => plural(value, "version")} />}
            />
            <Bar dataKey="versions" fill="var(--color-versions)" radius={4} isAnimationActive={false}>
              <LabelList dataKey="text" position="right" className="fill-foreground" fontSize={12} />
            </Bar>
          </BarChart>
        </ChartContainer>
      )}
    </Panel>
  );
}

/** Before and after: the requests version after version, all the deliverables together or one of them. */
function Convergence({ livrables }: { livrables: LivrableTracking[] }) {
  const [chosen, setChosen] = useState("all");
  const revised = livrables.filter((item) => item.versions > 1);
  const one = revised.find((item) => String(item.id) === chosen);
  // All together: each version number's requests, summed over the deliverables that reached it.
  const perVersion = one
    ? one.perVersion
    : [...new Set(revised.flatMap((item) => item.perVersion.map((entry) => entry.version)))]
        .sort((left, right) => left - right)
        .map((version) => ({ version, requests: revised.reduce((total, item) => total + (item.perVersion.find((entry) => entry.version === version)?.requests ?? 0), 0) }));
  const first = perVersion[0];
  const last = perVersion.at(-1);
  const change = first && last && first.requests && perVersion.length > 1 ? Math.round(((last.requests - first.requests) / first.requests) * 100) : undefined;
  const data = perVersion.map((item) => ({ version: versionName(item.version), requests: item.requests, text: plural(item.requests, "demande") }));
  return (
    <Panel
      title="Avant / après : demandes par version"
      description={
        first && last && perVersion.length > 1 ? (
          <>
            {versionName(first.version)} : {plural(first.requests, "demande")} → {versionName(last.version)} : {plural(last.requests, "demande")}
            {change !== undefined && (
              <span className={change <= 0 ? "tracking-change is-good" : "tracking-change is-warn"}>
                {change > 0 ? "+" : change < 0 ? "−" : ""}
                {Math.abs(change)} %
              </span>
            )}
          </>
        ) : (
          "Moins de demandes d’une version à l’autre : le livrable converge."
        )
      }
      action={revised.length > 0 && <LivrableSelect label="Livrable comparé" value={one ? chosen : "all"} livrables={revised} onChange={setChosen} />}
    >
      {revised.length === 0 ? (
        <TrackingEmpty icon={GitCompareArrows} title="Pas encore de deuxième version">
          Dès qu’un livrable passe en V02, vous voyez ici si les demandes du client diminuent d’une version à l’autre.
        </TrackingEmpty>
      ) : (
        <ChartContainer
          config={versionConfig}
          className="aspect-auto w-full"
          style={{ height: 8 + data.length * 40 }}
          role="img"
          aria-label={`${one?.name ?? "Tous les livrables"} : ${data.map((item) => `${item.version} : ${item.text}`).join(", ")}`}
        >
          <BarChart data={data} layout="vertical" margin={{ left: 0, right: 96, top: 4, bottom: 4 }} barCategoryGap={10}>
            <XAxis type="number" hide allowDecimals={false} />
            <YAxis type="category" dataKey="version" tickLine={false} axisLine={false} width={44} tick={{ fontSize: 12 }} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <Bar dataKey="requests" fill="var(--color-requests)" radius={4} minPointSize={2} isAnimationActive={false}>
              <LabelList dataKey="text" position="right" className="fill-foreground" fontSize={12} />
            </Bar>
          </BarChart>
        </ChartContainer>
      )}
    </Panel>
  );
}

/** Below this many weeks (or months), there is no trend to draw: their figures, side by side. */
const minTrend = 4;

/** The requests received each week (each month over a long period), by qualification: how they move over time. */
function OverTime({ input, now, livrables }: { input: TrackingInput; now: number; livrables: LivrableTracking[] }) {
  const { filters, filtered, reset, setLivrable, setPeriod } = useFilters();
  const { buckets, requests: totals } = tracked(input, now, filters);
  const { unit, list } = buckets;
  const data = list.map((bucket) => ({ ...bucket, label: bucketLabel(bucket.start, unit) }));
  const opening = unit === "month" ? "Mois de" : "Semaine du";
  // The span shown, said in dates: from the first week (or month) to today.
  const span = list.length ? `Du ${dayLabel(list[0]!.start)} à aujourd’hui · ${plural(totals.total, "demande")}` : undefined;
  return (
    <Panel
      title={unit === "month" ? "Demandes par mois" : "Demandes par semaine"}
      description={span}
      action={
        <>
          <LivrableSelect label="Livrable" value={filters.livrable} livrables={livrables} onChange={setLivrable} />
          <PeriodSelect value={filters.period} onChange={setPeriod} />
        </>
      }
    >
      {list.length === 0 && filtered ? (
        <FilteredEmpty title="Aucune demande sur ces filtres" onReset={reset} />
      ) : list.length === 0 ? (
        <TrackingEmpty icon={CalendarDays} title="Aucune demande reçue">
          Les retours du client s’afficheront ici semaine après semaine, répartis entre inclus, hors scope et à clarifier.
        </TrackingEmpty>
      ) : (
        <>
          <ChartContainer
            config={requestConfig}
            className="aspect-auto h-[240px] w-full"
            role="img"
            aria-label={data.map((bucket) => `${opening} ${bucket.label} : ${bucket.included} incluses, ${bucket.outside} hors scope, ${bucket.pending} à clarifier`).join(", ")}
          >
            {list.length < minTrend ? (
              // Too few weeks for a trend: their figures side by side, each with its number, none hidden behind another.
              <BarChart data={data} margin={{ left: -16, right: 8, top: 20, bottom: 0 }} barCategoryGap="30%" barGap={4}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11 }} />
                <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={40} tick={{ fontSize: 11 }} />
                <ChartTooltip cursor={{ fill: "var(--mist)", opacity: 0.6 }} content={<ChartTooltipContent labelFormatter={(label) => `${opening} ${String(label)}`} />} />
                {(["included", "outside", "pending"] as const).map((key) => (
                  <Bar key={key} dataKey={key} fill={`var(--color-${key})`} radius={[4, 4, 0, 0]} maxBarSize={56} isAnimationActive={false}>
                    <LabelList dataKey={key} position="top" className="fill-foreground" fontSize={12} />
                  </Bar>
                ))}
              </BarChart>
            ) : (
              // How it moves: one line per qualification, a dot per week (or month), a crosshair on hover.
              <LineChart data={data} margin={{ left: -16, right: 12, top: 12, bottom: 0 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11 }} minTickGap={8} />
                <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={40} tick={{ fontSize: 11 }} />
                <ChartTooltip cursor={{ stroke: "var(--border-input)", strokeDasharray: "3 3" }} content={<ChartTooltipContent labelFormatter={(label) => `${opening} ${String(label)}`} />} />
                {(["included", "outside", "pending"] as const).map((key) => (
                  <Line
                    key={key}
                    dataKey={key}
                    type="monotone"
                    stroke={`var(--color-${key})`}
                    strokeWidth={2}
                    dot={{ r: 4, fill: `var(--color-${key})`, stroke: "var(--paper)", strokeWidth: 2 }}
                    activeDot={{ r: 5, stroke: "var(--paper)", strokeWidth: 2 }}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            )}
          </ChartContainer>
          <ChartLegendContent config={requestConfig} totals={{ included: totals.included, outside: totals.outside, pending: totals.pending }} />
        </>
      )}
    </Panel>
  );
}
