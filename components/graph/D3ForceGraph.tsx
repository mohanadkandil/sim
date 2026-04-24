'use client';

import { useEffect, useRef, useCallback } from 'react';
import * as d3 from 'd3';

export interface AgentNode {
  id: string;
  name: string;
  activity: string;
  bio?: string;           // Rich persona description
  status?: string;        // Status line (e.g., "Power user for 2 years")
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
  pulsingNodes?: Set<string>;
  staticMode?: boolean; // If true, nodes don't move after initial layout
}

const LINK_COLORS: Record<string, string> = {
  family: '#7C9070',
  coliving: '#9B8AA8',
  college: '#5B9BD5',
  work: '#D4845E',
  social: '#C9C9C9',
};

export default function D3ForceGraph({ nodes, links, onNodeClick, pulsingNodes, staticMode = false }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const simulationRef = useRef<d3.Simulation<AgentNode, AgentLink> | null>(null);
  const gRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const nodeMapRef = useRef<Map<string, AgentNode>>(new Map());
  const initializedRef = useRef(false);

  const fitView = useCallback(() => {
    if (!svgRef.current || !simulationRef.current || !zoomRef.current) return;
    const nodes = simulationRef.current.nodes();
    if (nodes.length === 0) return;
    const container = svgRef.current.parentElement;
    const w = container?.clientWidth || 800;
    const h = container?.clientHeight || 600;
    const xs = nodes.map(d => d.x ?? 0);
    const ys = nodes.map(d => d.y ?? 0);
    const x0 = Math.min(...xs) - 50;
    const x1 = Math.max(...xs) + 50;
    const y0 = Math.min(...ys) - 50;
    const y1 = Math.max(...ys) + 50;
    const scale = Math.min(0.9, 0.9 * Math.min(w / (x1 - x0), h / (y1 - y0)));
    const tx = w / 2 - scale * (x0 + x1) / 2;
    const ty = h / 2 - scale * (y0 + y1) / 2;
    d3.select(svgRef.current)
      .transition().duration(600)
      .call(zoomRef.current.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
  }, []);

  // Handle pulsing nodes
  useEffect(() => {
    if (!gRef.current || !pulsingNodes) return;

    const g = gRef.current;

    // Add/remove pulse class from nodes
    g.select('.nodes')
      .selectAll<SVGGElement, AgentNode>('g.node')
      .each(function(d) {
        const isPulsing = pulsingNodes.has(d.id);
        const node = d3.select(this);

        if (isPulsing) {
          // Add pulse ring
          if (node.select('.pulse-ring').empty()) {
            node.insert('circle', ':first-child')
              .attr('class', 'pulse-ring')
              .attr('r', 30)
              .attr('fill', 'none')
              .attr('stroke', d.sentiment === 'positive' ? '#22C55E' :
                             d.sentiment === 'negative' ? '#EF4444' : '#8B5CF6')
              .attr('stroke-width', 3)
              .attr('opacity', 0.8)
              .transition()
              .duration(1000)
              .attr('r', 50)
              .attr('opacity', 0)
              .remove();

            // Scale up the node briefly
            node.transition()
              .duration(200)
              .attr('transform', `translate(${d.x || 0},${d.y || 0}) scale(1.2)`)
              .transition()
              .duration(300)
              .attr('transform', `translate(${d.x || 0},${d.y || 0}) scale(1)`);
          }
        }
      });
  }, [pulsingNodes]);

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

    zoomRef.current = zoom;
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
      .force('charge', d3.forceManyBody().strength(-150))
      .force('x', d3.forceX(width / 2).strength(0.06))
      .force('y', d3.forceY(height / 2).strength(0.06))
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
    const isFirstLoad = nodeMapRef.current.size === 0 || simulation.nodes().length === 0;
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

    // Add clip path definitions for avatar circles
    const defs = g.select('defs');
    nodeEnter.each(function(d) {
      if (!d.avatar) return;
      const safeId = d.id.replace(/[^a-zA-Z0-9_-]/g, '_');
      defs.append('clipPath')
        .attr('id', `clip-${safeId}`)
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

    // Inner circle — always segment color (visible as fallback and as ring)
    nodeEnter.append('circle')
      .attr('r', 20)
      .attr('fill', (d) => d.color)
      .attr('stroke', '#fff')
      .attr('stroke-width', 2);

    // Initials — always rendered; hidden on successful avatar load
    nodeEnter.append('text')
      .attr('class', 'initials')
      .text((d) => d.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2))
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('fill', '#fff')
      .attr('font-size', '10px')
      .attr('font-weight', '600')
      .attr('pointer-events', 'none');

    // Avatar via foreignObject — error-safe: hides itself on load failure, reveals initials on load success
    nodeEnter.filter((d) => !!d.avatar)
      .append('foreignObject')
      .attr('x', -20)
      .attr('y', -20)
      .attr('width', 40)
      .attr('height', 40)
      .attr('clip-path', (d) => {
        const safeId = d.id.replace(/[^a-zA-Z0-9_-]/g, '_');
        return `url(#clip-${safeId})`;
      })
      .each(function(this: SVGForeignObjectElement, d) {
        const fo = this;
        const nodeGroupEl = this.parentElement;
        const img = document.createElementNS('http://www.w3.org/1999/xhtml', 'img') as HTMLImageElement;
        img.src = d.avatar!;
        img.width = 40;
        img.height = 40;
        img.style.objectFit = 'cover';
        img.style.display = 'block';
        img.addEventListener('load', () => {
          const initials = nodeGroupEl?.querySelector('text.initials') as SVGTextElement | null;
          if (initials) initials.style.display = 'none';
        });
        img.addEventListener('error', () => {
          fo.style.display = 'none';
        });
        this.appendChild(img);
      });

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
        if (!staticMode && !event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
        if (staticMode) {
          d.x = event.x;
          d.y = event.y;
          updatePositions();
        }
      })
      .on('end', (event, d) => {
        if (!staticMode) {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        }
        // In static mode, keep nodes fixed at their new positions
      }));

    // Apply mouse events to all nodes
    allNodes
      .on('mouseover', function(event, d) {
        d3.select(this).select('circle').attr('stroke', '#7C9070').attr('stroke-width', 3);

        // Build tooltip with rich persona info
        const statusHtml = d.status ? `<div style="font-size: 10px; color: #8B5CF6; margin-bottom: 4px;">${d.status}</div>` : '';
        const bioHtml = d.bio ? `<div style="font-size: 11px; color: #4B4B4B; line-height: 1.4;">${d.bio}</div>` :
                                `<div style="font-size: 11px; color: #6B6B6B;">${d.activity || d.location}</div>`;
        const segmentHtml = `<div style="font-size: 10px; color: #8E8E93; margin-top: 6px; display: flex; align-items: center; gap: 4px;">
          <span style="width: 6px; height: 6px; border-radius: 50%; background: ${d.color};"></span>
          ${d.location}
        </div>`;

        tooltip
          .style('opacity', 1)
          .style('left', `${event.pageX + 10}px`)
          .style('top', `${event.pageY - 10}px`)
          .html(`
            <div style="font-weight: 600; margin-bottom: 6px; font-size: 13px;">${d.name}</div>
            ${statusHtml}
            ${bioHtml}
            ${segmentHtml}
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
    if (staticMode) {
      simulation.alpha(0.8).restart();
      setTimeout(() => {
        simulation.stop();
        updatedNodes.forEach(n => { n.fx = n.x; n.fy = n.y; });
        updatePositions();
        if (isFirstLoad) fitView();
      }, 2000);
    } else {
      simulation.alpha(0.3).restart();
      if (isFirstLoad) setTimeout(() => fitView(), 1500);
    }

  }, [nodes, links, onNodeClick, initializeGraph, updatePositions, staticMode]);

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
      <button
        onClick={fitView}
        className="absolute bottom-4 right-4 bg-white border border-[#E5E5E0] rounded-lg px-3 py-1.5 text-xs text-[#6B6B6B] hover:bg-[#F5F5F0] shadow-sm transition-colors"
        title="Reset view"
      >
        ⊞ Fit view
      </button>
      <div
        ref={tooltipRef}
        className="fixed pointer-events-none bg-white rounded-lg shadow-lg border border-[#F0EFEC] px-4 py-3 z-50 opacity-0 transition-opacity"
        style={{ maxWidth: '280px' }}
      />
    </div>
  );
}
