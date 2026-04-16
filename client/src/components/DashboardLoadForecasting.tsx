import { useMemo, useState } from 'react';
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
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useRegistration } from '@/contexts/RegistrationContext';
import type { Agent } from '@/data/agentAggregation';
import { format } from 'date-fns';
import { zhTW } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type ForecastData = {
  timestamp: string;
  hour: number;
  minute: number;
  totalLoadKw: number;
  details: {
    meterNo: string;
    loadKw: number;
    assetName: string;
  }[];
};

type DailyForecast = {
  date: string;
  totalDailyLoad: number;
  peakLoad: number;
  avgLoad: number;
  forecastData: ForecastData[];
};

// Generate mock forecast data for a day (every 15 minutes)
function generateDailyForecast(date: Date, agent: Agent): DailyForecast {
  const forecastData: ForecastData[] = [];
  const baseLoad = agent.loadCap * 0.6; // Base load at 60% of capacity

  for (let hour = 0; hour < 24; hour++) {
    for (let quarter = 0; quarter < 4; quarter++) {
      const minute = quarter * 15;
      const timestamp = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;

      // Simulate load variation throughout the day
      let loadMultiplier = 0.4; // Base nighttime load

      if (hour >= 6 && hour < 9) loadMultiplier = 0.7; // Morning peak
      else if (hour >= 9 && hour < 12) loadMultiplier = 0.8; // Mid-morning
      else if (hour >= 12 && hour < 14) loadMultiplier = 0.9; // Lunch time
      else if (hour >= 14 && hour < 17) loadMultiplier = 0.85; // Afternoon
      else if (hour >= 17 && hour < 20) loadMultiplier = 1.0; // Evening peak
      else if (hour >= 20 && hour < 22) loadMultiplier = 0.75; // Evening

      // Add some randomness
      const randomFactor = 0.9 + Math.random() * 0.2;
      const totalLoadKw = Number((baseLoad * loadMultiplier * randomFactor).toFixed(1));

      const details = agent.loadList.map((loadAsset) => ({
        meterNo: loadAsset.meterNo ?? '未知',
        loadKw: Number((loadAsset.capacityKw * loadMultiplier * randomFactor).toFixed(1)),
        assetName: loadAsset.name,
      }));

      forecastData.push({
        timestamp,
        hour,
        minute,
        totalLoadKw,
        details,
      });
    }
  }

  const totalDailyLoad = forecastData.reduce((sum, data) => sum + data.totalLoadKw, 0);
  const peakLoad = Math.max(...forecastData.map(data => data.totalLoadKw));
  const avgLoad = totalDailyLoad / forecastData.length;

  return {
    date: format(date, 'yyyy-MM-dd'),
    totalDailyLoad: Number(totalDailyLoad.toFixed(1)),
    peakLoad: Number(peakLoad.toFixed(1)),
    avgLoad: Number(avgLoad.toFixed(1)),
    forecastData,
  };
}

export default function DashboardLoadForecasting() {
  const { agents } = useRegistration();
  const [selectedAgentId, setSelectedAgentId] = useState<number>(agents[0]?.id ?? 1);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) ?? agents[0],
    [agents, selectedAgentId]
  );

  const dailyForecast = useMemo(
    () => selectedAgent ? generateDailyForecast(selectedDate, selectedAgent) : null,
    [selectedAgent, selectedDate]
  );

  const chartData = useMemo(
    () => dailyForecast?.forecastData.map((data) => ({
      time: data.timestamp,
      load: data.totalLoadKw,
    })) ?? [],
    [dailyForecast]
  );

  if (!selectedAgent || !dailyForecast) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-slate-500">載入中...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.24em] text-slate-500">3.1 負載預測</p>
              <h1 className="mt-2 text-3xl font-bold text-slate-900">每日負載預測申報</h1>
              <p className="mt-2 text-sm text-slate-600">
                聚合用電端電號，每15分鐘預測用電量並進行申報
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Select value={selectedAgentId.toString()} onValueChange={(value) => setSelectedAgentId(Number(value))}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="選擇代理人" />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id.toString()}>
                      {agent.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-64 justify-start text-left font-normal",
                      !selectedDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {selectedDate ? format(selectedDate, "yyyy年MM月dd日", { locale: zhTW }) : "選擇日期"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => date && setSelectedDate(date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm text-slate-500">預測總用電量</p>
              <p className="mt-3 text-3xl font-bold text-slate-900">{dailyForecast.totalDailyLoad.toFixed(1)} kWh</p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm text-slate-500">峰值負載</p>
              <p className="mt-3 text-3xl font-bold text-slate-900">{dailyForecast.peakLoad.toFixed(1)} kW</p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm text-slate-500">平均負載</p>
              <p className="mt-3 text-3xl font-bold text-slate-900">{dailyForecast.avgLoad.toFixed(1)} kW</p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm text-slate-500">用電端數量</p>
              <p className="mt-3 text-3xl font-bold text-slate-900">{selectedAgent.loadList.length}</p>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm uppercase tracking-[0.24em] text-slate-500">代理人資訊</p>
          <div className="mt-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-600">代理人名稱</span>
              <span className="font-medium text-slate-900">{selectedAgent.name}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-600">統編</span>
              <span className="font-mono text-slate-900">{selectedAgent.taxId}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-600">用電容量</span>
              <span className="font-medium text-slate-900">{selectedAgent.loadCap} kW</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-600">用電表數</span>
              <span className="font-medium text-slate-900">{selectedAgent.loadMeters}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500">預測用電量圖表</p>
            <h2 className="mt-1 text-xl font-bold text-slate-900">
              {format(selectedDate, "yyyy年MM月dd日", { locale: zhTW })} 負載預測曲線
            </h2>
          </div>
          <div className="rounded-3xl bg-slate-100 px-4 py-2 text-sm text-slate-600">
            每15分鐘預測
          </div>
        </div>

        <div className="mt-6 h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="loadGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0.08} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="time"
                tickLine={false}
                axisLine={false}
                tick={{ fill: '#64748b', fontSize: 12 }}
                interval="preserveStartEnd"
              />
              <YAxis tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <Tooltip
                formatter={(value: number) => [`${value} kW`, '預測用電量']}
                labelFormatter={(label) => `時間: ${label}`}
              />
              <Area
                type="monotone"
                dataKey="load"
                stroke="#dc2626"
                fill="url(#loadGradient)"
                strokeWidth={2}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500">詳細申報數據</p>
            <h2 className="mt-1 text-xl font-bold text-slate-900">每15分鐘預測用電明細</h2>
          </div>
          <div className="rounded-3xl bg-slate-100 px-4 py-2 text-sm text-slate-600">
            共 {dailyForecast.forecastData.length} 筆資料
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-3xl border border-slate-200">
          <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="px-4 py-3">時間</th>
                <th className="px-4 py-3">總預測用電量 (kW)</th>
                <th className="px-4 py-3">用電端明細</th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {dailyForecast.forecastData.map((data, index) => (
                <tr key={index} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-4 font-medium text-slate-700">{data.timestamp}</td>
                  <td className="px-4 py-4 text-slate-900 font-bold">{data.totalLoadKw} kW</td>
                  <td className="px-4 py-4">
                    <div className="space-y-1">
                      {data.details.map((detail, detailIndex) => (
                        <div key={detailIndex} className="flex justify-between items-center text-xs">
                          <span className="text-slate-600">
                            <span className="font-mono">{detail.meterNo}</span> - {detail.assetName}
                          </span>
                          <span className="font-medium text-slate-900">{detail.loadKw} kW</span>
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex justify-between items-center">
          <p className="text-sm text-slate-500">
            數據更新時間：{format(new Date(), "yyyy-MM-dd HH:mm:ss")}
          </p>
          <div className="flex gap-3">
            <Button variant="outline">下載申報表</Button>
            <Button>提交申報</Button>
          </div>
        </div>
      </section>
    </div>
  );
}