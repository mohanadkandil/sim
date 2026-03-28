'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';

export interface AgentNodeData extends Record<string, unknown> {
  name: string;
  avatar: string;
  activity: string;
  sentiment: 'positive' | 'negative' | 'neutral' | 'curious';
  thought?: string;
  location?: string;
  isActive?: boolean;
}

export type AgentNode = Node<AgentNodeData, 'agent'>;

const SENTIMENT_COLORS: Record<string, string> = {
  positive: '#7C9070',
  negative: '#EF4444',
  neutral: '#9B8AA8',
  curious: '#5B9BD5',
};

const SENTIMENT_BG: Record<string, string> = {
  positive: 'rgba(124, 144, 112, 0.08)',
  negative: 'rgba(239, 68, 68, 0.08)',
  neutral: 'rgba(155, 138, 168, 0.08)',
  curious: 'rgba(91, 155, 213, 0.08)',
};

function AgentNodeComponent({ data, selected }: NodeProps<AgentNode>) {
  const sentimentColor = SENTIMENT_COLORS[data.sentiment] || '#9B8AA8';

  return (
    <div className="relative group">
      {/* Main Circle */}
      <div
        className={`
          w-11 h-11 rounded-full flex items-center justify-center text-white text-sm font-semibold
          shadow-[0_2px_12px_rgba(0,0,0,0.1)] transition-all duration-200 cursor-pointer
          ${selected ? 'ring-[3px] ring-[#7C9070] ring-offset-1' : ''}
          ${data.isActive ? 'ring-[3px] ring-[#7C9070] ring-offset-1' : ''}
        `}
        style={{ backgroundColor: data.avatar }}
      >
        {data.name.split(' ').map(n => n[0]).join('')}
      </div>

      {/* Sentiment indicator */}
      <div
        className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-[1.5px] border-white shadow-sm"
        style={{ backgroundColor: sentimentColor }}
      />

      {/* Name label */}
      <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap">
        <span className="text-[10px] font-medium text-[#6B6B6B]">
          {data.name.split(' ')[0]}
        </span>
      </div>

      {/* Hover tooltip */}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
        <div className="bg-white rounded-[8px] shadow-[0_2px_12px_rgba(0,0,0,0.12)] border border-[#F0EFEC] px-2.5 py-1.5 min-w-[120px]">
          <div className="text-[11px] font-semibold text-[#2D2D2D]">{data.name}</div>
          <div className="text-[9px] text-[#6B6B6B] mt-0.5">{data.activity}</div>
          {data.location && (
            <div className="text-[8px] text-[#8E8E93] mt-0.5 flex items-center gap-0.5">
              <svg className="w-2 h-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              </svg>
              {data.location}
            </div>
          )}
        </div>
      </div>

      {/* Connection handles - invisible but functional */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2 !h-2 !bg-transparent !border-0"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2 !h-2 !bg-transparent !border-0"
      />
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className="!w-2 !h-2 !bg-transparent !border-0"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className="!w-2 !h-2 !bg-transparent !border-0"
      />
    </div>
  );
}

export default memo(AgentNodeComponent);
