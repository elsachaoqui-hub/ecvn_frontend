import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useRegistration } from '@/contexts/RegistrationContext';
import type { Agent, AssetItem } from '@/data/agentAggregation';

type RealtimeStatus = '正常' | '異常' | '離線';

type MeterReading = {
  meterId: string;
  meterNo: string;
  agentId: number;
  agentName: string;
  assetName: string;
  capacityKw: number;
  powerKw: number;
  renewableType: AssetItem['renewableType'];
  updatedAt: number;
  status: RealtimeStatus;
};

type TimelinePoint = {
  timestamp: number;
  totalPowerKw: number;
};

function formatTimestamp(value: number) {
  return new Date(value).toLocaleTimeString('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getStatusTone(status: RealtimeStatus) {
  switch (status) {
    case '正常':
      return 'bg-emerald-100 text-emerald-700';
    case '異常':
      return 'bg-amber-100 text-amber-700';
    case '離線':
      return 'bg-slate-100 text-slate-700';
    default:
      return 'bg-slate-100 text-slate-700';
  }
}

function createReadingFromAsset(agent: Agent, asset: AssetItem): MeterReading {
  const baseRate = 0.35 + Math.random() * 0.55;
  const powerKw = Number((asset.capacityKw * baseRate).toFixed(1));
  const status: RealtimeStatus = powerKw <= asset.capacityKw * 0.1 ? '離線' : powerKw <= asset.capacityKw * 0.4 ? '異常' : '正常';

  return {
    meterId: asset.id,
    meterNo: asset.meterNo ?? '未知',
    agentId: agent.id,
    agentName: agent.name,
    assetName: asset.name,
    capacityKw: asset.capacityKw,
    powerKw,
    renewableType: asset.renewableType,
    updatedAt: Date.now(),
    status,
  };
}

function createInitialReadings(agents: Agent[]) {
  const entries: Record<string, MeterReading> = {};
  agents.forEach((agent) => {
    agent.genList.forEach((asset) => {
      entries[asset.id] = createReadingFromAsset(agent, asset);
    });
  });
  return entries;
}

function createInitialTimeline(readings: MeterReading[]) {
  const now = Date.now();
  const points: TimelinePoint[] = [];
  let lastValue = readings.reduce((sum, item) => sum + item.powerKw, 0);

  for (let index = 11; index >= 0; index -= 1) {
    const timestamp = now - index * 60_000;
    const drift = (Math.random() - 0.5) * 0.16;
    lastValue = Math.max(0, lastValue * (1 + drift));
    points.push({ timestamp, totalPowerKw: Number(lastValue.toFixed(1)) });
  }

  return points;
}

function generateNextReading(prev: MeterReading): MeterReading {
  const variance = 0.9 + Math.random() * 0.2;
  const newPower = Math.max(0, Math.min(prev.capacityKw, prev.powerKw * variance + (Math.random() - 0.5) * 20));
  const powerKw = Number(newPower.toFixed(1));
  const status: RealtimeStatus = powerKw <= prev.capacityKw * 0.1 ? '離線' : powerKw <= prev.capacityKw * 0.4 ? '異常' : '正常';

  return {
    ...prev,
    powerKw,
    status,
    updatedAt: Date.now(),
  };
}

export default function DashboardRealTimeGeneration() {
  const { agents } = useRegistration();
  const [selectedAgentId, setSelectedAgentId] = useState<number | 'all'>('all');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [timeline, setTimeline] = useState<TimelinePoint[]>([]);
  const [measurements, setMeasurements] = useState<Record<string, MeterReading>>(() => createInitialReadings(agents));
  const [filteredTimeline, setFilteredTimeline] = useState<TimelinePoint[]>([]);

  const filteredReadings = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();
    return Object.values(measurements).filter((reading) => {
      const matchesAgent = selectedAgentId === 'all' || reading.agentId === selectedAgentId;
      const matchesSearch =
        !keyword ||
        reading.meterNo.toLowerCase().includes(keyword) ||
        reading.assetName.toLowerCase().includes(keyword) ||
        reading.agentName.toLowerCase().includes(keyword);
      return matchesAgent && matchesSearch;
    });
  }, [measurements, selectedAgentId, searchKeyword]);

  const aggregatedByAgent = useMemo(() => {
    const groups = new Map<number, { agentName: string; totalPowerKw: number; totalCapacityKw: number; meters: number }>();
    filteredReadings.forEach((reading) => {
      const summary = groups.get(reading.agentId) ?? {
        agentName: reading.agentName,
        totalPowerKw: 0,
        totalCapacityKw: 0,
        meters: 0,
      };
      summary.totalPowerKw += reading.powerKw;
      summary.totalCapacityKw += reading.capacityKw;
      summary.meters += 1;
      groups.set(reading.agentId, summary);
    });
    return Array.from(groups.entries()).map(([agentId, summary]) => ({ agentId, ...summary }));
  }, [filteredReadings]);

  const totalPower = useMemo(
    () => filteredReadings.reduce((sum, reading) => sum + reading.powerKw, 0),
    [filteredReadings]
  );

  const totalCapacity = useMemo(
    () => filteredReadings.reduce((sum, reading) => sum + reading.capacityKw, 0),
    [filteredReadings]
  );

  const advanceMeasurements = useCallback((prev: Record<string, MeterReading>) => {
    const next: Record<string, MeterReading> = {};
    Object.values(prev).forEach((reading) => {
      next[reading.meterId] = generateNextReading(reading);
    });
    const totalPowerKw = Object.values(next).reduce((sum, item) => sum + item.powerKw, 0);
    return { next, totalPowerKw };
  }, []);

  const updateAllReadings = useCallback(() => {
    setMeasurements((prev) => {
      const { next, totalPowerKw } = advanceMeasurements(prev);
      setTimeline((timelinePrev) => [...timelinePrev.slice(-11), { timestamp: Date.now(), totalPowerKw: Number(totalPowerKw.toFixed(1)) }]);
      return next;
    });
  }, [advanceMeasurements]);

  useEffect(() => {
    if (agents.length === 0) return;
    const initial = createInitialReadings(agents);
    setMeasurements(initial);
    setTimeline(createInitialTimeline(Object.values(initial)));
    // Initialize filtered timeline with all readings initially
    setFilteredTimeline(createInitialTimeline(Object.values(initial)));
  }, [agents]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setMeasurements((prev) => {
        const { next, totalPowerKw } = advanceMeasurements(prev);
        setTimeline((timelinePrev) => [...timelinePrev.slice(-11), { timestamp: Date.now(), totalPowerKw: Number(totalPowerKw.toFixed(1)) }]);
        return next;
      });
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [advanceMeasurements]);

  // Update filtered timeline when measurements or filters change
  useEffect(() => {
    const filteredPower = filteredReadings.reduce((sum, reading) => sum + reading.powerKw, 0);
    setFilteredTimeline((prev) => [...prev.slice(-11), { timestamp: Date.now(), totalPowerKw: Number(filteredPower.toFixed(1)) }]);
  }, [filteredReadings]);

  const chartData = useMemo(
    () => timeline.map((point) => ({ time: formatTimestamp(point.timestamp), value: point.totalPowerKw })),
    [timeline]
  );

  const filteredChartData = useMemo(
    () => filteredTimeline.map((point) => ({ time: formatTimestamp(point.timestamp), value: point.totalPowerKw })),
    [filteredTimeline]
  );

  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.24em] text-slate-500">2.3 即時發電量監控</p>
              <h1 className="mt-2 text-3xl font-bold text-slate-900">再生能源即時發電儀表板</h1>
              <p className="mt-2 text-sm text-slate-600">
                即時接收電表發電量資料，顯示個別發電端表號與代理人聚合發電情況。
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="secondary" onClick={updateAllReadings}>
                立即更新
              </Button>
              <p className="text-sm text-slate-500">上次更新：{formatTimestamp(Date.now())}</p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm text-slate-500">累計發電(即時)</p>
              <p className="mt-3 text-3xl font-bold text-slate-900">{totalPower.toFixed(1)} kW</p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm text-slate-500">監控表號數</p>
              <p className="mt-3 text-3xl font-bold text-slate-900">{filteredReadings.length}</p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm text-slate-500">代理人數</p>
              <p className="mt-3 text-3xl font-bold text-slate-900">{aggregatedByAgent.length}</p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm text-slate-500">平均利用率</p>
              <p className="mt-3 text-3xl font-bold text-slate-900">
                {totalCapacity > 0 ? `${((totalPower / totalCapacity) * 100).toFixed(1)}%` : '0.0%'}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm uppercase tracking-[0.24em] text-slate-500">過去 12 分鐘總發電趨勢</p>
          <div className="mt-6 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="powerGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.08} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <Tooltip formatter={(value: number) => [`${value} kW`, '發電量']} />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#0ea5e9"
                  fill="url(#powerGradient)"
                  strokeWidth={3}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <p className="text-sm text-slate-500">監控篩選</p>
              <div className="flex flex-wrap gap-3"> 
                <Select value={selectedAgentId.toString()} onValueChange={(value) => setSelectedAgentId(value === 'all' ? 'all' : Number(value))}>
                  <SelectTrigger className="w-72">
                    <SelectValue placeholder="選擇代理人" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部代理人</SelectItem>
                    {agents.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id.toString()}>
                        {agent.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={searchKeyword}
                  onChange={(event) => setSearchKeyword(event.target.value)}
                  placeholder="搜尋表號 / 案場 / 代理人"
                />
              </div>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {aggregatedByAgent.map((summary) => (
              <div key={summary.agentId} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-slate-500">{summary.agentName}</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">{summary.totalPowerKw.toFixed(1)} kW</p>
                  </div>
                  <div className="text-right text-sm text-slate-600">
                    <p>發電表數：{summary.meters}</p>
                    <p>裝置容量：{summary.totalCapacityKw} kW</p>
                    <p>
                      利用率：
                      {summary.totalCapacityKw > 0
                        ? ` ${((summary.totalPowerKw / summary.totalCapacityKw) * 100).toFixed(1)}%`
                        : ' 0.0%'}
                    </p>
                  </div>
                </div>
              </div>
            ))}
            {aggregatedByAgent.length === 0 && (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-slate-500">
                目前沒有符合條件的發電代理人。
              </div>
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-slate-500">個別電表監控</p>
              <h2 className="mt-1 text-xl font-bold text-slate-900">表號即時發電狀態</h2>
            </div>
            <div className="rounded-3xl bg-slate-100 px-4 py-2 text-sm text-slate-600">
              共 {filteredReadings.length} 筆資料
            </div>
          </div>

          <div className="mt-6 overflow-hidden rounded-3xl border border-slate-200">
            <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th className="px-4 py-3">代理人</th>
                  <th className="px-4 py-3">表號 / 案場</th>
                  <th className="px-4 py-3">即時發電</th>
                  <th className="px-4 py-3">容量</th>
                  <th className="px-4 py-3">狀態</th>
                  <th className="px-4 py-3">更新時間</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {filteredReadings.map((reading) => (
                  <tr key={reading.meterId} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-4 font-medium text-slate-700">{reading.agentName}</td>
                    <td className="px-4 py-4">
                      <p className="font-bold text-slate-900">{reading.meterNo}</p>
                      <p className="text-slate-500">{reading.assetName}</p>
                    </td>
                    <td className="px-4 py-4 text-slate-900">
                      {reading.powerKw.toFixed(1)} kW
                      <div className="mt-1 text-xs text-slate-500">
                        {reading.renewableType ?? 'N/A'}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-slate-700">{reading.capacityKw} kW</td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${getStatusTone(reading.status)}`}>
                        {reading.status}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-slate-500">{formatTimestamp(reading.updatedAt)}</td>
                  </tr>
                ))}
                {filteredReadings.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      沒有符合篩選條件的即時電表資料。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Filtered Generation Trend Chart */}
      {(selectedAgentId !== 'all' || searchKeyword.trim()) && (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-slate-500">篩選後發電趨勢</p>
              <h2 className="mt-1 text-xl font-bold text-slate-900">監控篩選聚合發電趨勢圖</h2>
              <p className="mt-2 text-sm text-slate-600">
                顯示當前篩選條件下的聚合發電量變化趨勢
              </p>
            </div>
            <div className="rounded-3xl bg-slate-100 px-4 py-2 text-sm text-slate-600">
              過去 12 分鐘
            </div>
          </div>

          <div className="mt-6 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={filteredChartData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="filteredPowerGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.08} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <Tooltip formatter={(value: number) => [`${value} kW`, '篩選後發電量']} />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#2563eb"
                  fill="url(#filteredPowerGradient)"
                  strokeWidth={3}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm text-slate-500">當前篩選發電量</p>
              <p className="mt-3 text-2xl font-bold text-slate-900">
                {filteredReadings.reduce((sum, reading) => sum + reading.powerKw, 0).toFixed(1)} kW
              </p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm text-slate-500">篩選表號數</p>
              <p className="mt-3 text-2xl font-bold text-slate-900">{filteredReadings.length}</p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm text-slate-500">平均利用率</p>
              <p className="mt-3 text-2xl font-bold text-slate-900">
                {totalCapacity > 0
                  ? `${((totalPower / totalCapacity) * 100).toFixed(1)}%`
                  : '0.0%'}
              </p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
