'use client';

import { useEffect, useRef } from 'react';
import * as d3 from 'd3';

export interface AgentNode {
  id: string;
  name: string;
  activity: string;
  sentiment: 'positive' | 'negative' | 'neutral' | 'curious';
  location: string;
  color: string;
  avatar?: string;
}

export interface AgentLink {
  source: string;
  target: string;
  type: 'family' | 'coliving' | 'college' | 'work' | 'social';
}

interface Props {
  nodes: AgentNode[];
  links: AgentLink[];
  onNodeClick?: (node: AgentNode) => void;
}

const LINK_COLORS: Record<string, string> = {
  family: '#7C9070',
  coliving: '#9B8AA8',
  college: '#5B9BD5',
  work: '#D4845E',
  social: '#C9C9C9',
};

export default function D3ForceGraph({ nodes, links, onNodeClick }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!svgRef.current || !nodes.length) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const container = svgRef.current.parentElement;
    const width = container?.clientWidth || 800;
    const height = container?.clientHeight || 600;

    svg.attr('width', width).attr('height', height);

    // Create a group for zoom/pan
    const g = svg.append('g');

    // Set up zoom
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom);

    // Create simulation data copies
    const simNodes = nodes.map(d => ({ ...d }));
    const simLinks = links.map(d => ({ ...d }));

    // Create force simulation
    const simulation = d3.forceSimulation(simNodes as d3.SimulationNodeDatum[])
      .force('link', d3.forceLink(simLinks)
        .id((d: any) => d.id)
        .distance(100)
        .strength(0.5))
      .force('charge', d3.forceManyBody().strength(-400))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(35));

    // Draw links
    const link = g.append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(simLinks)
      .join('line')
      .attr('stroke', (d: any) => LINK_COLORS[d.type] || '#C9C9C9')
      .attr('stroke-width', (d: any) => d.type === 'family' ? 2 : 1)
      .attr('stroke-opacity', 0.6);

    // Draw nodes
    const node = g.append('g')
      .attr('class', 'nodes')
      .selectAll<SVGGElement, any>('g')
      .data(simNodes)
      .join('g')
      .attr('cursor', 'pointer');

    // Add drag behavior
    node.call(d3.drag<SVGGElement, any>()
      .on('start', dragstarted)
      .on('drag', dragged)
      .on('end', dragended));

    // Define clip paths for circular images
    const defs = g.append('defs');

    simNodes.forEach((d: any) => {
      defs.append('clipPath')
        .attr('id', `clip-${d.id}`)
        .append('circle')
        .attr('r', 20)
        .attr('cx', 0)
        .attr('cy', 0);
    });

    // Node background circle (for border)
    node.append('circle')
      .attr('r', 22)
      .attr('fill', '#fff')
      .style('filter', 'drop-shadow(0 2px 8px rgba(0,0,0,0.15))');

    // Node avatar images
    node.append('image')
      .attr('xlink:href', (d: any) => d.avatar || '')
      .attr('x', -20)
      .attr('y', -20)
      .attr('width', 40)
      .attr('height', 40)
      .attr('clip-path', (d: any) => `url(#clip-${d.id})`)
      .attr('preserveAspectRatio', 'xMidYMid slice')
      .on('error', function(this: SVGImageElement) {
        // Fallback to colored circle if image fails
        const parent = (this as SVGImageElement).parentNode as SVGGElement;
        d3.select(parent).select('image').remove();
        d3.select(parent).append('circle')
          .attr('r', 20)
          .attr('fill', (d: any) => d.color)
          .attr('stroke', '#fff')
          .attr('stroke-width', 2);
        d3.select(parent).append('text')
          .text((d: any) => d.name.split(' ').map((n: string) => n[0]).join(''))
          .attr('text-anchor', 'middle')
          .attr('dy', '0.35em')
          .attr('fill', '#fff')
          .attr('font-size', '10px')
          .attr('font-weight', '600')
          .attr('pointer-events', 'none');
      });

    // Node labels (name below)
    node.append('text')
      .text((d: any) => d.name.split(' ')[0])
      .attr('text-anchor', 'middle')
      .attr('dy', '35px')
      .attr('fill', '#6B6B6B')
      .attr('font-size', '10px')
      .attr('font-weight', '500')
      .attr('pointer-events', 'none');

    // Sentiment indicator
    node.append('circle')
      .attr('r', 5)
      .attr('cx', 14)
      .attr('cy', 14)
      .attr('fill', (d: any) => {
        switch (d.sentiment) {
          case 'positive': return '#22C55E';
          case 'negative': return '#EF4444';
          case 'curious': return '#5B9BD5';
          default: return '#9B8AA8';
        }
      })
      .attr('stroke', '#fff')
      .attr('stroke-width', 1.5);

    // Tooltip
    const tooltip = d3.select(tooltipRef.current);

    node
      .on('mouseover', function(event, d: any) {
        d3.select(this).select('circle').attr('stroke', '#7C9070').attr('stroke-width', 3);
        tooltip
          .style('opacity', 1)
          .style('left', `${event.pageX + 10}px`)
          .style('top', `${event.pageY - 10}px`)
          .html(`
            <div style="font-weight: 600; margin-bottom: 4px;">${d.name}</div>
            <div style="font-size: 11px; color: #6B6B6B;">${d.activity}</div>
            <div style="font-size: 10px; color: #8E8E93; margin-top: 4px;">${d.location}</div>
          `);
      })
      .on('mousemove', function(event) {
        tooltip
          .style('left', `${event.pageX + 10}px`)
          .style('top', `${event.pageY - 10}px`);
      })
      .on('mouseout', function() {
        d3.select(this).select('circle').attr('stroke', '#fff').attr('stroke-width', 2);
        tooltip.style('opacity', 0);
      })
      .on('click', function(event, d: any) {
        if (onNodeClick) {
          onNodeClick(d);
        }
      });

    // Update positions on tick
    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      node.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
    });

    // Drag functions
    function dragstarted(event: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }

    function dragged(event: any) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }

    function dragended(event: any) {
      if (!event.active) simulation.alphaTarget(0);
      event.subject.fx = null;
      event.subject.fy = null;
    }

    // Cleanup
    return () => {
      simulation.stop();
    };
  }, [nodes, links, onNodeClick]);

  return (
    <div className="relative w-full h-full">
      <svg ref={svgRef} className="w-full h-full" />
      <div
        ref={tooltipRef}
        className="fixed pointer-events-none bg-white rounded-lg shadow-lg border border-[#F0EFEC] px-3 py-2 z-50 opacity-0 transition-opacity"
        style={{ maxWidth: '200px' }}
      />
    </div>
  );
}
