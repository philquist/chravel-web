import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ArrowDown, ArrowUp, ExternalLink, RefreshCw, Search, TrendingUp } from 'lucide-react';
import { SeoHead } from '@/components/seo/SeoHead';

const SeoTrendChart = lazy(() =>
  import('./SeoTrendChart').then(module => ({ default: module.SeoTrendChart })),
);

interface Keyword {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  kd?: number | null;
}
interface PageRow {
  url: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}
interface TrendPoint {
  date: string;
  clicks: number;
  impressions: number;
}
interface Overview {
  siteUrl: string;
  startDate: string;
  endDate: string;
  totals: { clicks: number; impressions: number; ctr: number };
  keywords: Keyword[];
  pages: PageRow[];
  trend: TrendPoint[];
  opportunities: Keyword[];
  semrushEnabled: boolean;
}

const fmt = (n: number) => n.toLocaleString();
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const pos = (n: number) => n.toFixed(1);

async function callSeo<T>(payload: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('seo-dashboard', { body: payload });
  if (error) throw error;
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as T;
}

type SortKey = 'clicks' | 'impressions' | 'position' | 'ctr';

function SortableTable<T extends Record<string, any>>({
  rows,
  columns,
  defaultSort,
  search,
}: {
  rows: T[];
  columns: {
    key: keyof T & string;
    label: string;
    render?: (r: T) => React.ReactNode;
    numeric?: boolean;
  }[];
  defaultSort: keyof T & string;
  search?: (r: T) => string;
}) {
  const [sortKey, setSortKey] = useState<string>(defaultSort);
  const [desc, setDesc] = useState(true);
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const base = term && search ? rows.filter(r => search(r).toLowerCase().includes(term)) : rows;
    return [...base].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'number' && typeof bv === 'number') return desc ? bv - av : av - bv;
      return desc ? String(bv).localeCompare(String(av)) : String(av).localeCompare(String(bv));
    });
  }, [rows, sortKey, desc, q, search]);

  return (
    <div className="space-y-3">
      {search && (
        <div className="relative max-w-xs">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Filter…"
            className="pl-8 h-9"
          />
        </div>
      )}
      <div className="rounded-md border border-border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map(c => (
                <TableHead key={c.key} className={c.numeric ? 'text-right' : ''}>
                  <button
                    className="inline-flex items-center gap-1 hover:text-primary"
                    onClick={() => {
                      if (sortKey === c.key) setDesc(d => !d);
                      else {
                        setSortKey(c.key);
                        setDesc(true);
                      }
                    }}
                  >
                    {c.label}
                    {sortKey === c.key &&
                      (desc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
                  </button>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="text-center text-muted-foreground py-8"
                >
                  No data
                </TableCell>
              </TableRow>
            ) : (
              filtered.slice(0, 100).map((r, i) => (
                <TableRow key={i}>
                  {columns.map(c => (
                    <TableCell key={c.key} className={c.numeric ? 'text-right tabular-nums' : ''}>
                      {c.render ? c.render(r) : String(r[c.key] ?? '—')}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {filtered.length > 100 && (
        <p className="text-xs text-muted-foreground">
          Showing 100 of {filtered.length} rows. Refine filter to narrow.
        </p>
      )}
    </div>
  );
}

function KdBadge({ kd }: { kd?: number | null }) {
  if (kd == null) return <span className="text-muted-foreground">—</span>;
  const variant = kd < 30 ? 'secondary' : kd < 60 ? 'outline' : 'destructive';
  return <Badge variant={variant as any}>{Math.round(kd)}</Badge>;
}

function PositionBadge({ p }: { p: number }) {
  const cls =
    p <= 3
      ? 'bg-primary/20 text-primary border-primary/40'
      : p <= 10
        ? 'bg-secondary text-secondary-foreground'
        : p <= 20
          ? 'bg-amber-500/15 text-amber-400 border-amber-500/40'
          : 'bg-muted text-muted-foreground';
  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded-md border border-transparent text-xs font-medium ${cls}`}
    >
      {pos(p)}
    </span>
  );
}

export default function SeoDashboard() {
  const [siteUrl, setSiteUrl] = useState<string>('');
  const [days, setDays] = useState<number>(28);
  const [manualSite, setManualSite] = useState('https://chravel.app/');

  const sitesQ = useQuery({
    queryKey: ['seo-sites'],
    queryFn: () =>
      callSeo<{ sites: { siteUrl: string; permissionLevel: string }[] }>({ action: 'list_sites' }),
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!siteUrl && sitesQ.data?.sites?.length) setSiteUrl(sitesQ.data.sites[0].siteUrl);
  }, [sitesQ.data, siteUrl]);

  const overviewQ = useQuery({
    queryKey: ['seo-overview', siteUrl, days],
    queryFn: () => callSeo<Overview>({ action: 'overview', siteUrl, days }),
    enabled: !!siteUrl,
    staleTime: 60 * 1000,
  });

  const ov = overviewQ.data;
  const competitorTraffic = { chravel: 0, wanderlog: 1580000, tripit: 48000, troupe: 0 };
  const denominator =
    competitorTraffic.chravel +
    competitorTraffic.wanderlog +
    competitorTraffic.tripit +
    competitorTraffic.troupe;
  const trafficShare = denominator === 0 ? null : competitorTraffic.chravel / denominator;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SeoHead
        title="Admin SEO Dashboard | ChravelApp"
        description="Internal admin SEO dashboard."
        path="/admin/seo"
        noindex
      />
      <div className="container max-w-7xl mx-auto px-4 py-8 space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">SEO Keyword Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Live data from Google Search Console
              {ov?.semrushEnabled
                ? ' · Semrush KD enrichment active'
                : ' · Add SEMRUSH_API_KEY for keyword difficulty'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={siteUrl} onValueChange={setSiteUrl}>
              <SelectTrigger className="w-[260px] min-h-[42px]">
                <SelectValue placeholder="Choose verified site" />
              </SelectTrigger>
              <SelectContent>
                {(sitesQ.data?.sites || []).map(s => (
                  <SelectItem key={s.siteUrl} value={s.siteUrl}>
                    {s.siteUrl}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(days)} onValueChange={v => setDays(Number(v))}>
              <SelectTrigger className="w-[110px] min-h-[42px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 days</SelectItem>
                <SelectItem value="28">28 days</SelectItem>
                <SelectItem value="90">90 days</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={() => overviewQ.refetch()}
              disabled={overviewQ.isFetching}
              className="min-h-[42px]"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${overviewQ.isFetching ? 'animate-spin' : ''}`} />{' '}
              Refresh
            </Button>
          </div>
        </header>

        {sitesQ.isError && (
          <Card className="border-destructive/40">
            <CardContent className="pt-6 text-sm text-destructive">
              Failed to load Search Console sites: {(sitesQ.error as Error).message}
            </CardContent>
          </Card>
        )}

        {!sitesQ.isLoading && (sitesQ.data?.sites?.length ?? 0) === 0 && (
          <Card>
            <CardHeader>
              <CardTitle>No verified sites yet</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                Your Google Search Console connection has no verified properties. To start pulling
                rankings, impressions and clicks for chravel.app:
              </p>
              <ol className="list-decimal pl-5 space-y-1">
                <li>
                  Open{' '}
                  <a
                    className="text-primary underline"
                    target="_blank"
                    rel="noreferrer"
                    href="https://search.google.com/search-console/welcome"
                  >
                    Search Console
                  </a>{' '}
                  and add <code>https://chravel.app/</code> as a URL prefix property.
                </li>
                <li>
                  Use the meta-tag verification method and paste the token into{' '}
                  <code>index.html</code>.
                </li>
                <li>Deploy, then click Verify in Search Console.</li>
                <li>Come back and refresh this page.</li>
              </ol>
              <div className="flex gap-2 pt-2">
                <Input
                  value={manualSite}
                  onChange={e => setManualSite(e.target.value)}
                  placeholder="https://chravel.app/"
                  className="max-w-sm"
                />
                <Button onClick={() => setSiteUrl(manualSite)} className="min-h-[42px]">
                  Try this URL
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {overviewQ.isError && (
          <Card className="border-destructive/40">
            <CardContent className="pt-6 text-sm text-destructive">
              {(overviewQ.error as Error).message}
            </CardContent>
          </Card>
        )}

        {ov && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Kpi label="Clicks" value={fmt(ov.totals.clicks)} />
              <Kpi label="Impressions" value={fmt(ov.totals.impressions)} />
              <Kpi label="Avg CTR" value={pct(ov.totals.ctr)} />
              <Kpi label="Tracked keywords" value={fmt(ov.keywords.length)} />
            </div>
            <Card>
              <CardHeader>
                <CardTitle>Modeled traffic share benchmark (Semrush estimate)</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                <p>
                  Formula: traffic_share = domain_estimated_organic_traffic / sum(selected_domains).
                </p>
                <p>
                  ChravelApp modeled share:{' '}
                  {trafficShare === null
                    ? 'Not enough data'
                    : `${(trafficShare * 100).toFixed(2)}%`}{' '}
                  (chravel.app currently untracked in Semrush modeled organic traffic).
                </p>
                <p className="text-muted-foreground">
                  Comparison set: wanderlog.com (~1.58M), tripit.com (~48K), troupe.com (untracked).
                  Estimates are directional and not first-party analytics.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" /> Trend · {ov.startDate} →{' '}
                  {ov.endDate}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  <Suspense
                    fallback={
                      <div className="h-full w-full animate-pulse rounded-md bg-muted/30" />
                    }
                  >
                    <SeoTrendChart data={ov.trend} />
                  </Suspense>
                </div>
              </CardContent>
            </Card>

            <Tabs defaultValue="keywords">
              <TabsList>
                <TabsTrigger value="keywords">Keywords</TabsTrigger>
                <TabsTrigger value="pages">Pages</TabsTrigger>
                <TabsTrigger value="opps">Opportunities</TabsTrigger>
              </TabsList>

              <TabsContent value="keywords" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Ranking keywords</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <SortableTable<Keyword>
                      rows={ov.keywords}
                      defaultSort="impressions"
                      search={r => r.query}
                      columns={[
                        { key: 'query', label: 'Query' },
                        {
                          key: 'position',
                          label: 'Position',
                          numeric: true,
                          render: r => <PositionBadge p={r.position} />,
                        },
                        {
                          key: 'clicks',
                          label: 'Clicks',
                          numeric: true,
                          render: r => fmt(r.clicks),
                        },
                        {
                          key: 'impressions',
                          label: 'Impressions',
                          numeric: true,
                          render: r => fmt(r.impressions),
                        },
                        { key: 'ctr', label: 'CTR', numeric: true, render: r => pct(r.ctr) },
                        {
                          key: 'kd',
                          label: 'KD',
                          numeric: true,
                          render: r => <KdBadge kd={r.kd} />,
                        },
                      ]}
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="pages" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Top pages</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <SortableTable<PageRow>
                      rows={ov.pages}
                      defaultSort="clicks"
                      search={r => r.url}
                      columns={[
                        {
                          key: 'url',
                          label: 'URL',
                          render: r => (
                            <a
                              href={r.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary hover:underline inline-flex items-center gap-1 max-w-[420px] truncate"
                            >
                              <span className="truncate">{r.url}</span>
                              <ExternalLink className="h-3 w-3 shrink-0" />
                            </a>
                          ),
                        },
                        {
                          key: 'clicks',
                          label: 'Clicks',
                          numeric: true,
                          render: r => fmt(r.clicks),
                        },
                        {
                          key: 'impressions',
                          label: 'Impressions',
                          numeric: true,
                          render: r => fmt(r.impressions),
                        },
                        { key: 'ctr', label: 'CTR', numeric: true, render: r => pct(r.ctr) },
                        {
                          key: 'position',
                          label: 'Avg pos.',
                          numeric: true,
                          render: r => <PositionBadge p={r.position} />,
                        },
                      ]}
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="opps" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Almost-page-1 opportunities</CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      Position 11–20 with ≥10 impressions. Improving these pages is usually the
                      fastest traffic win.
                    </p>
                  </CardHeader>
                  <CardContent>
                    <SortableTable<Keyword>
                      rows={ov.opportunities}
                      defaultSort="impressions"
                      search={r => r.query}
                      columns={[
                        { key: 'query', label: 'Query' },
                        {
                          key: 'position',
                          label: 'Position',
                          numeric: true,
                          render: r => <PositionBadge p={r.position} />,
                        },
                        {
                          key: 'impressions',
                          label: 'Impressions',
                          numeric: true,
                          render: r => fmt(r.impressions),
                        },
                        {
                          key: 'clicks',
                          label: 'Clicks',
                          numeric: true,
                          render: r => fmt(r.clicks),
                        },
                        { key: 'ctr', label: 'CTR', numeric: true, render: r => pct(r.ctr) },
                        {
                          key: 'kd',
                          label: 'KD',
                          numeric: true,
                          render: r => <KdBadge kd={r.kd} />,
                        },
                      ]}
                    />
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}

        {(sitesQ.isLoading || (siteUrl && overviewQ.isLoading)) && (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold mt-1 tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}
