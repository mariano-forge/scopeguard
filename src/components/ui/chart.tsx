"use client"

// shadcn's chart, on Recharts and Kora's tokens: a config names each series and its colour (exposed to the
// chart as --color-<key>), the tooltip and legend read their labels from it. Kora has no dark mode, so a
// series has one colour.

import * as React from "react"
import * as RechartsPrimitive from "recharts"
import { cn } from "cn"

export type ChartConfig = Record<string, { label?: React.ReactNode; color?: string }>

const ChartContext = React.createContext<{ config: ChartConfig } | null>(null)

function useChart() {
  const context = React.useContext(ChartContext)
  if (!context) throw new Error("useChart must be used within a <ChartContainer />")
  return context
}

function ChartContainer({
  id,
  className,
  children,
  config,
  ...props
}: React.ComponentProps<"div"> & {
  config: ChartConfig
  children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>["children"]
}) {
  const uniqueId = React.useId()
  const chartId = `chart-${id ?? uniqueId.replace(/:/g, "")}`
  const colors = Object.entries(config).flatMap(([key, item]) => (item.color ? [`--color-${key}: ${item.color};`] : []))
  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-slot="chart"
        data-chart={chartId}
        className={cn(
          "flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/60 [&_.recharts-layer]:outline-hidden [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted/60 [&_.recharts-reference-line_[stroke='#ccc']]:stroke-border [&_.recharts-surface]:outline-hidden",
          className,
        )}
        {...props}
      >
        {colors.length > 0 && <style dangerouslySetInnerHTML={{ __html: `[data-chart=${chartId}] { ${colors.join(" ")} }` }} />}
        <RechartsPrimitive.ResponsiveContainer>{children}</RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  )
}

const ChartTooltip = RechartsPrimitive.Tooltip

/** One row of a tooltip, as Recharts passes it. */
type TooltipEntry = { name?: string | number; value?: unknown; dataKey?: unknown; color?: string; payload?: Record<string, unknown> }

function ChartTooltipContent({
  active,
  payload,
  label,
  className,
  hideLabel = false,
  labelFormatter,
  valueFormatter,
}: {
  active?: boolean
  payload?: readonly TooltipEntry[]
  label?: React.ReactNode
  className?: string
  hideLabel?: boolean
  /** The tooltip's title, from the hovered point's label and data. */
  labelFormatter?: (label: React.ReactNode, payload: readonly TooltipEntry[]) => React.ReactNode
  /** A value as written in the tooltip. */
  valueFormatter?: (value: number, key: string) => React.ReactNode
}) {
  const { config } = useChart()
  if (!active || !payload?.length) return null
  return (
    <div className={cn("grid min-w-32 items-start gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs shadow-md", className)}>
      {!hideLabel && <div className="font-medium text-foreground">{labelFormatter ? labelFormatter(label, payload) : label}</div>}
      <div className="grid gap-1">
        {payload.map((item) => {
          const key = String(item.dataKey ?? item.name ?? "value")
          const value = typeof item.value === "number" ? item.value : Number(item.value ?? 0)
          return (
            <div key={key} className="flex w-full items-center gap-2">
              {/* A bar coloured per point (a Cell) carries its colour in its data, as `fill`. */}
              <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: (item.payload?.fill as string | undefined) ?? item.color ?? `var(--color-${key})` }} aria-hidden="true" />
              <span className="flex-1 text-muted-foreground">{config[key]?.label ?? item.name}</span>
              <span className="font-medium text-foreground tabular-nums">{valueFormatter ? valueFormatter(value, key) : value.toLocaleString("fr-FR")}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** The legend, outside the plot (so it takes the chart's config): each series' colour and label, with its total when given. */
function ChartLegendContent({ config, className, keys, totals }: { config: ChartConfig; className?: string; keys?: string[]; totals?: Record<string, React.ReactNode> }) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground", className)}>
      {(keys ?? Object.keys(config)).map((key) => (
        <li key={key} className="flex items-center gap-1.5">
          <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: config[key]?.color }} aria-hidden="true" />
          {config[key]?.label}
          {totals?.[key] !== undefined && <b className="font-semibold text-foreground tabular-nums">{totals[key]}</b>}
        </li>
      ))}
    </ul>
  )
}

export { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegendContent }
