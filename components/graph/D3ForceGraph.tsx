'use client';

import { useEffect, useRef, useCallback } from 'react';
import * as d3 from 'd3';

export interface AgentNode {
  id: string;
  name: string;
  activity: string;
  sentiment: 'positive' | 'negative' | 'neutral' | 'curious';
  location: string;
  color: string;
  avatar?: string;
  // D3 simulation properties
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface AgentLink {
  source: string | AgentNode;
  target: string | AgentNode;
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
  const simulationRef = useRef<d3.Simulation<AgentNode, AgentLink> | null>(null);
  const gRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null);
  const nodeMapRef = useRef<Map<string, AgentNode>>(new Map());
  const initializedRef = useRef(false);

  // Initialize the SVG and simulation once
  const initializeGraph = useCallback(() => {
    if (!svgRef.current || initializedRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const container = svgRef.current.parentElement;
    const width = container?.clientWidth || 800;
    const height = container?.clientHeight || 600;

    svg.attr('width', width).attr('height', height);

    // Create main group for zoom/pan
    const g = svg.append('g');
    gRef.current = g;

    // Set up zoom
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom);

    // Create groups for links and nodes
    g.append('g').attr('class', 'links');
    g.append('g').attr('class', 'nodes');
    g.append('defs');

    // Create simulation
    simulationRef.current = d3.forceSimulation<AgentNode>([])
      .force('link', d3.forceLink<AgentNode, AgentLink>([])
        .id((d) => d.id)
        .distance(100)
        .strength(0.5))
      .force('charge', d3.forceManyBody().strength(-400))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(35))
      .on('tick', () => updatePositions());

    initializedRef.current = true;
  }, []);

  // Update positions on simulation tick
  const updatePositions = useCallback(() => {
    if (!gRef.current) return;

    gRef.current.select('.links')
      .selectAll<SVGLineElement, AgentLink>('line')
      .attr('x1', (d) => (d.source as AgentNode).x || 0)
      .attr('y1', (d) => (d.source as AgentNode).y || 0)
      .attr('x2', (d) => (d.target as AgentNode).x || 0)
      .attr('y2', (d) => (d.target as AgentNode).y || 0);

    gRef.current.select('.nodes')
      .selectAll<SVGGElement, AgentNode>('g.node')
      .attr('transform', (d) => `translate(${d.x || 0},${d.y || 0})`);
  }, []);

  // Update graph with new nodes and links (progressive)
  useEffect(() => {
    if (!svgRef.current) return;

    // Initialize if not done
    if (!initializedRef.current) {
      initializeGraph();
    }

    if (!gRef.current || !simulationRef.current) return;

    const g = gRef.current;
    const simulation = simulationRef.current;
    const tooltip = d3.select(tooltipRef.current);
    const container = svgRef.current.parentElement;
    const width = container?.clientWidth || 800;
    const height = container?.clientHeight || 600;

    // Update node map with positions from existing nodes
    const simNodes = simulation.nodes();
    simNodes.forEach(n => {
      nodeMapRef.current.set(n.id, n);
    });

    // Build updated nodes array (preserve positions of existing nodes)
    const updatedNodes: AgentNode[] = nodes.map(node => {
      const existing = nodeMapRef.current.get(node.id);
      if (existing) {
        return { ...node, x: existing.x, y: existing.y, fx: existing.fx, fy: existing.fy };
      }
      // New node - start near center with some randomness
      return {
        ...node,
        x: width / 2 + (Math.random() - 0.5) * 100,
        y: height / 2 + (Math.random() - 0.5) * 100
      };
    });

    // Update node map
    nodeMapRef.current.clear();
    updatedNodes.forEach(n => nodeMapRef.current.set(n.id, n));

    // Build updated links
    const updatedLinks: AgentLink[] = links.map(link => ({
      ...link,
      source: typeof link.source === 'string' ? link.source : link.source.id,
      target: typeof link.target === 'string' ? link.target : link.target.id,
    }));

    // Filter to only valid links (both source and target exist)
    const validLinks = updatedLinks.filter(link => {
      const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
      const targetId = typeof link.target === 'string' ? link.target : link.target.id;
      return nodeMapRef.current.has(sourceId) && nodeMapRef.current.has(targetId);
    });

    // Update simulation
    simulation.nodes(updatedNodes);
    (simulation.force('link') as d3.ForceLink<AgentNode, AgentLink>)?.links(validLinks);

    // Update links with enter/update/exit
    const linkSelection = g.select('.links')
      .selectAll<SVGLineElement, AgentLink>('line')
      .data(validLinks, (d) => {
        const sourceId = typeof d.source === 'string' ? d.source : d.source.id;
        const targetId = typeof d.target === 'string' ? d.target : d.target.id;
        return `${sourceId}-${targetId}`;
      });

    linkSelection.exit().remove();

    linkSelection.enter()
      .append('line')
      .attr('stroke', (d) => LINK_COLORS[d.type] || '#C9C9C9')
      .attr('stroke-width', (d) => d.type === 'family' ? 2 : 1)
      .attr('stroke-opacity', 0)
      .transition()
      .duration(300)
      .attr('stroke-opacity', 0.6);

    // Update nodes with enter/update/exit
    const nodeSelection = g.select('.nodes')
      .selectAll<SVGGElement, AgentNode>('g.node')
      .data(updatedNodes, (d) => d.id);

    nodeSelection.exit().remove();

    // Enter new nodes with animation
    const nodeEnter = nodeSelection.enter()
      .append('g')
      .attr('class', 'node')
      .attr('cursor', 'pointer')
      .style('opacity', 0)
      .attr('transform', (d) => `translate(${d.x || 0},${d.y || 0}) scale(0.1)`);

    // Add clip path definitions for new nodes
    const defs = g.select('defs');
    nodeEnter.each(function(d) {
      defs.append('clipPath')
        .attr('id', `clip-${d.id}`)
        .append('circle')
        .attr('r', 20)
        .attr('cx', 0)
        .attr('cy', 0);
    });

    // Node background circle
    nodeEnter.append('circle')
      .attr('r', 22)
      .attr('fill', '#fff')
      .style('filter', 'drop-shadow(0 2px 8px rgba(0,0,0,0.15))');

    // Colored inner circle (always show - no avatar fallback needed)
    nodeEnter.append('circle')
      .attr('r', 20)
      .attr('fill', (d) => d.color)
      .attr('stroke', '#fff')
      .attr('stroke-width', 2);

    // Initials
    nodeEnter.append('text')
      .attr('class', 'initials')
      .text((d) => d.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2))
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('fill', '#fff')
      .attr('font-size', '10px')
      .attr('font-weight', '600')
      .attr('pointer-events', 'none');

    // Node labels
    nodeEnter.append('text')
      .attr('class', 'label')
      .text((d) => d.name.split(' ')[0])
      .attr('text-anchor', 'middle')
      .attr('dy', '35px')
      .attr('fill', '#6B6B6B')
      .attr('font-size', '10px')
      .attr('font-weight', '500')
      .attr('pointer-events', 'none');

    // Sentiment indicator
    nodeEnter.append('circle')
      .attr('class', 'sentiment')
      .attr('r', 5)
      .attr('cx', 14)
      .attr('cy', 14)
      .attr('fill', (d) => {
        switch (d.sentiment) {
          case 'positive': return '#22C55E';
          case 'negative': return '#EF4444';
          case 'curious': return '#5B9BD5';
          default: return '#9B8AA8';
        }
      })
      .attr('stroke', '#fff')
      .attr('stroke-width', 1.5);

    // Animate entrance
    nodeEnter
      .transition()
      .duration(400)
      .ease(d3.easeBackOut.overshoot(1.2))
      .style('opacity', 1)
      .attr('transform', (d) => `translate(${d.x || 0},${d.y || 0}) scale(1)`);

    // Apply drag to all nodes (including new ones)
    const allNodes = g.select('.nodes').selectAll<SVGGElement, AgentNode>('g.node');

    allNodes.call(d3.drag<SVGGElement, AgentNode>()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      }));

    // Apply mouse events to all nodes
    allNodes
      .on('mouseover', function(event, d) {
        d3.select(this).select('circle').attr('stroke', '#7C9070').attr('stroke-width', 3);
        tooltip
          .style('opacity', 1)
          .style('left', `${event.pageX + 10}px`)
          .style('top', `${event.pageY - 10}px`)
          .html(`
            <div style="font-weight: 600; margin-bottom: 4px;">${d.name}</div>
            <div style="font-size: 11px; color: #6B6B6B;">${d.activity || d.location}</div>
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
      .on('click', function(event, d) {
        if (onNodeClick) {
          onNodeClick(d);
        }
      });

    // Restart simulation with some energy
    simulation.alpha(0.3).restart();

  }, [nodes, links, onNodeClick, initializeGraph, updatePositions]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      simulationRef.current?.stop();
      initializedRef.current = false;
    };
  }, []);

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
