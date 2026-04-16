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
  totalGenerationKw: number;
  details: {
    meterNo: string;
    generationKw: number;
    assetName: string;
    renewableType: string;
  }[];
};

type DailyForecast = {
  date: string;
  totalDailyGeneration: number;
  peakGeneration: number;
  avgGeneration: number;
  forecastData: ForecastData[];
};

// Generate mock forecast data for a day (every 15 minutes)
function generateDailyForecast(date: Date, agent: Agent): DailyForecast {
  const forecastData: ForecastData[] = [];
  const baseGeneration = agent.genCap * 0.7; // Base generation at 70% of capacity

  for (let hour = 0; hour < 24; hour++) {
    for (let quarter = 0; quarter < 4; quarter++) {
      const minute = quarter * 15;
      const timestamp = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;

      // Simulate generation variation throughout the day based on solar/wind patterns
      let generationMultiplier = 0.1; // Base nighttime generation (minimal)

      if (hour >= 6 && hour < 8) generationMultiplier = 0.3; // Early morning
      else if (hour >= 8 && hour < 10) generationMultiplier = 0.6; // Morning ramp up
      else if (hour >= 10 && hour < 14) generationMultiplier = 0.9; // Peak solar hours
      else if (hour >= 14 && hour < 16) generationMultiplier = 0.8; // Afternoon
      else if (hour >= 16 && hour < 18) generationMultiplier = 0.5; // Late afternoon
      else if (hour >= 18 && hour < 20) generationMultiplier = 0.2; // Evening

      // Add weather/cloud variation for solar, wind variation for wind
      const weatherFactor = 0.8 + Math.random() * 0.4; // 0.8-1.2 variation
      const totalGenerationKw = Number((baseGeneration * generationMultiplier * weatherFactor).toFixed(1));

      const details = agent.genList.map((genAsset) => ({
        meterNo: genAsset.meterNo ?? '未知',
        generationKw: Number((genAsset.capacityKw * generationMultiplier * weatherFactor).toFixed(1)),
        assetName: genAsset.name,
        renewableType: genAsset.renewableType ?? '其他',
      }));

      forecastData.push({
        timestamp,
        hour,
        minute,
        totalGenerationKw,
        details,
      });
    }
  }

  const totalDailyGeneration = forecastData.reduce((sum, data) => sum + data.totalGenerationKw, 0);
  const peakGeneration = Math.max(...forecastData.map(data => data.totalGenerationKw));
  const avgGeneration = totalDailyGeneration / forecastData.length;

  return {
    date: format(date, 'yyyy-MM-dd'),
    totalDailyGeneration: Number(totalDailyGeneration.toFixed(1)),
    peakGeneration: Number(peakGeneration.toFixed(1)),
    avgGeneration: Number(avgGeneration.toFixed(1)),
    forecastData,
  };
}

function getRenewableTypeColor(type: string) {
  switch (type) {
    case 'PV':
      return 'bg-emerald-100 text-emerald-700';
    case 'WIND':
      return 'bg-sky-100 text-sky-700';
    default:
      return 'bg-slate-100 text-slate-700';
  }
}

export default function DashboardRenewableForecasting() {
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
      generation: data.totalGenerationKw,
    })) ?? [],
    [dailyForecast]
  );

  const renewableTypeBreakdown = useMemo(() => {
    if (!dailyForecast) return [];

    const breakdown: Record<string, { total: number; count: number }> = {};

    dailyForecast.forecastData.forEach((data) => {
      data.details.forEach((detail) => {
        const type = detail.renewableType;
        if (!breakdown[type]) {
          breakdown[type] = { total: 0, count: 0 };
        }
        breakdown[type].total += detail.generationKw;
        breakdown[type].count += 1;
      });
    });

    return Object.entries(breakdown).map(([type, data]) => ({
      type,
      totalGeneration: Number(data.total.toFixed(1)),
      avgGeneration: Number((data.total / data.count).toFixed(1)),
      percentage: Number(((data.total / dailyForecast.totalDailyGeneration) * 100).toFixed(1)),
    }));
  }, [dailyForecast]);

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
              <p className="text-sm uppercase tracking-[0.24em] text-slate-500">3.2 再生能源預測</p>
              <h1 className="mt-2 text-3xl font-bold text-slate-900">每日再生能源發電預測申報</h1>
              <p className="mt-2 text-sm text-slate-600">
                聚合發電端電號，每15分鐘預測發電量並進行申報
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
              <p className="text-sm text-slate-500">預測總發電量</p>
              <p className="mt-3 text-3xl font-bold text-slate-900">{dailyForecast.totalDailyGeneration.toFixed(1)} kWh</p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm text-slate-500">峰值發電</p>
              <p className="mt-3 text-3xl font-bold text-slate-900">{dailyForecast.peakGeneration.toFixed(1)} kW</p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm text-slate-500">平均發電</p>
              <p className="mt-3 text-3xl font-bold text-slate-900">{dailyForecast.avgGeneration.toFixed(1)} kW</p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm text-slate-500">發電端數量</p>
              <p className="mt-3 text-3xl font-bold text-slate-900">{selectedAgent.genList.length}</p>
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
              <span className="text-sm text-slate-600">發電容量</span>
              <span className="font-medium text-slate-900">{selectedAgent.genCap} kW</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-600">發電表數</span>
              <span className="font-medium text-slate-900">{selectedAgent.genMeters}</span>
            </div>
          </div>

          <div className="mt-6">
            <p className="text-sm text-slate-500 mb-3">再生能源類型分布</p>
            <div className="space-y-2">
              {renewableTypeBreakdown.map((item) => (
                <div key={item.type} className="flex justify-between items-center">
                  <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-bold ${getRenewableTypeColor(item.type)}`}>
                    {item.type}
                  </span>
                  <span className="text-sm text-slate-600">{item.percentage}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500">預測發電量圖表</p>
            <h2 className="mt-1 text-xl font-bold text-slate-900">
              {format(selectedDate, "yyyy年MM月dd日", { locale: zhTW })} 再生能源發電預測曲線
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
                <linearGradient id="generationGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.08} />
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
                formatter={(value: number) => [`${value} kW`, '預測發電量']}
                labelFormatter={(label) => `時間: ${label}`}
              />
              <Area
                type="monotone"
                dataKey="generation"
                stroke="#059669"
                fill="url(#generationGradient)"
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
            <h2 className="mt-1 text-xl font-bold text-slate-900">每15分鐘預測發電明細</h2>
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
                <th className="px-4 py-3">總預測發電量 (kW)</th>
                <th className="px-4 py-3">發電端明細</th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {dailyForecast.forecastData.map((data, index) => (
                <tr key={index} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-4 font-medium text-slate-700">{data.timestamp}</td>
                  <td className="px-4 py-4 text-slate-900 font-bold">{data.totalGenerationKw} kW</td>
                  <td className="px-4 py-4">
                    <div className="space-y-1">
                      {data.details.map((detail, detailIndex) => (
                        <div key={detailIndex} className="flex justify-between items-center text-xs">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${getRenewableTypeColor(detail.renewableType)}`}>
                              {detail.renewableType}
                            </span>
                            <span className="text-slate-600">
                              <span className="font-mono">{detail.meterNo}</span> - {detail.assetName}
                            </span>
                          </div>
                          <span className="font-medium text-slate-900">{detail.generationKw} kW</span>
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