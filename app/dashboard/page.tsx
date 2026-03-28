'use client';

import TopNav from '@/components/TopNav';
import { Calendar } from 'lucide-react';
import { Bar, BarChart, XAxis, YAxis } from 'recharts';
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';

interface MetricData {
  label: string;
  value: string;
  change: string;
  changeType: 'sage' | 'curious' | 'skeptical';
  valueColor?: string;
}

interface SimulationRow {
  feature: string;
  sentiment: number;
  sentimentType: 'sage' | 'curious' | 'skeptical' | 'neutral';
  agents: string;
}

const METRICS: MetricData[] = [
  { label: 'Total Simulations', value: '48', change: '+12', changeType: 'sage' },
  { label: 'Avg. Sentiment', value: '74%', change: '+5%', changeType: 'sage', valueColor: '#7C9070' },
  { label: 'Agent Responses', value: '12.4k', change: '+34%', changeType: 'curious' },
  { label: 'Features Tested', value: '23', change: '+3', changeType: 'skeptical' },
];

const CHART_DATA = [
  { day: 'Mon', value: 160, fill: '#7C9070' },
  { day: 'Tue', value: 200, fill: '#7C9070' },
  { day: 'Wed', value: 140, fill: '#7C9070' },
  { day: 'Thu', value: 240, fill: '#7C9070' },
  { day: 'Fri', value: 180, fill: '#7C9070' },
  { day: 'Sat', value: 100, fill: '#9B8AA8' },
  { day: 'Sun', value: 260, fill: '#7C9070' },
];

const SIMULATIONS: SimulationRow[] = [
  { feature: 'Dark mode + themes', sentiment: 72, sentimentType: 'sage', agents: '2,847' },
  { feature: 'AI copilot assistant', sentiment: 89, sentimentType: 'sage', agents: '1,523' },
  { feature: 'Remove free tier', sentiment: 23, sentimentType: 'skeptical', agents: '2,100' },
  { feature: 'Mobile app launch', sentiment: 61, sentimentType: 'curious', agents: '980' },
  { feature: 'Redesign onboarding', sentiment: 45, sentimentType: 'neutral', agents: '1,205' },
];

const CHANGE_STYLES = {
  sage: 'bg-[rgba(124,144,112,0.08)] text-[#4A5D43]',
  curious: 'bg-[rgba(91,155,213,0.08)] text-[#5B9BD5]',
  skeptical: 'bg-[rgba(212,132,94,0.08)] text-[#D4845E]',
  neutral: 'bg-[rgba(155,138,168,0.08)] text-[#9B8AA8]',
};

const chartConfig = {
  value: {
    label: 'Sentiment',
    color: '#7C9070',
  },
} satisfies ChartConfig;

export default function DashboardPage() {
  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#F7F6F3]">
      <TopNav />

      <div className="flex-1 px-12 py-8 flex flex-col gap-6 overflow-hidden">
        {/* Header */}
        <div className="flex items-center w-full">
          <h1 className="font-display text-[28px] font-medium text-[#2D2D2D] tracking-[-0.8px]">
            Analytics Overview
          </h1>
          <div className="flex-1" />
          <button className="flex items-center gap-1.5 rounded-[8px] px-3.5 py-2 border border-[#F0EFEC] bg-transparent cursor-pointer">
            <Calendar className="w-3.5 h-3.5 text-[#8E8E93]" />
            <span className="text-[13px] font-medium text-[#6B6B6B]">
              Last 7 days
            </span>
          </button>
        </div>

        {/* Metrics Grid */}
        <div className="flex gap-5 w-full">
          {METRICS.map((metric) => (
            <div
              key={metric.label}
              className="flex-1 rounded-[16px] bg-white border border-[#F0EFEC] shadow-[0_4px_30px_#00000006] p-6 flex flex-col gap-2"
            >
              <span className="text-[13px] font-medium text-[#6B6B6B]">
                {metric.label}
              </span>
              <div className="flex items-end gap-2">
                <span
                  className="font-display text-4xl font-medium tracking-[-1px] leading-none"
                  style={{ color: metric.valueColor || '#2D2D2D' }}
                >
                  {metric.value}
                </span>
                <span
                  className={`rounded-[6px] px-2 py-1 font-mono text-[11px] leading-none mb-1 ${
                    CHANGE_STYLES[metric.changeType]
                  }`}
                >
                  {metric.change}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom Row: Chart + Table */}
        <div className="flex gap-5 items-start">
          {/* Chart Card */}
          <div className="flex-1 rounded-[16px] bg-white border border-[#F0EFEC] shadow-[0_4px_30px_#00000006] p-6 flex flex-col gap-5">
            <div className="flex items-center w-full">
              <span className="font-display text-lg font-medium text-[#2D2D2D]">
                Sentiment Over Time
              </span>
              <div className="flex-1" />
              <div className="flex gap-3">
                <LegendItem color="#7C9070" label="Positive" />
                <LegendItem color="#5B9BD5" label="Curious" />
                <LegendItem color="#9B8AA8" label="Neutral" />
              </div>
            </div>
            <ChartContainer config={chartConfig} className="w-full h-[240px] [&>div]:!aspect-auto">
              <BarChart
                data={CHART_DATA}
                margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
                barCategoryGap="20%"
              >
                <XAxis
                  dataKey="day"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fontWeight: 500, fill: '#8E8E93' }}
                  dy={10}
                />
                <YAxis hide />
                <ChartTooltip
                  content={<ChartTooltipContent hideLabel />}
                  cursor={false}
                />
                <Bar
                  dataKey="value"
                  radius={[8, 8, 0, 0]}
                  fill="#7C9070"
                />
              </BarChart>
            </ChartContainer>
          </div>

          {/* Table Card */}
          <div className="w-[420px] shrink-0 rounded-[16px] bg-white border border-[#F0EFEC] shadow-[0_4px_30px_#00000006] flex flex-col">
            <div className="flex items-center px-6 py-[18px]">
              <span className="font-display text-lg font-medium text-[#2D2D2D]">
                Recent Simulations
              </span>
              <div className="flex-1" />
              <span className="text-xs font-semibold text-[#7C9070] cursor-pointer">
                View all
              </span>
            </div>
            <div className="flex items-center px-6 py-2.5 bg-[#FAFAF8] border-t border-b border-[#F0EFEC]">
              <span className="flex-1 text-xs font-semibold text-[#8E8E93]">
                Feature
              </span>
              <span className="w-20 text-xs font-semibold text-[#8E8E93]">
                Sentiment
              </span>
              <span className="w-[60px] text-xs font-semibold text-[#8E8E93]">
                Agents
              </span>
            </div>
            <div>
              {SIMULATIONS.map((sim) => (
                <div
                  key={sim.feature}
                  className="flex items-center px-6 py-3.5 border-b border-[#F0EFEC] last:border-b-0"
                >
                  <span className="flex-1 text-[13px] font-medium text-[#2D2D2D]">
                    {sim.feature}
                  </span>
                  <div className="w-20">
                    <span
                      className={`inline-flex items-center rounded-[6px] px-2 py-1 font-mono text-[11px] ${
                        CHANGE_STYLES[sim.sentimentType]
                      }`}
                    >
                      {sim.sentiment}%
                    </span>
                  </div>
                  <span className="w-[60px] text-[13px] text-[#6B6B6B]">
                    {sim.agents}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <div
        className="w-2 h-2 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="text-[11px] text-[#6B6B6B]">{label}</span>
    </div>
  );
}
