/**
 * Claude Flow V3 - Modular AI Agent Coordination System
 *
 * This is the main entry point that re-exports all modules.
 * Each module can also be imported directly for tree-shaking.
 *
 * @example
 * // Import everything
 * import * as claudeFlow from './v3';
 *
 * // Or import specific modules
 * import { SwarmCoordinator } from './v3/src';
 * import { Agent } from './v3/src/agent-lifecycle/domain/Agent';
 *
 * Complete reimagining based on 10 ADRs:
 * - ADR-001: Adopt agentic-flow as core foundation
 * - ADR-002: Domain-Driven Design structure
 * - ADR-003: Single coordination engine
 * - ADR-004: Plugin-based architecture
 * - ADR-005: MCP-first API design
 * - ADR-006: Unified memory service
 * - ADR-007: Event sourcing for state changes
 * - ADR-008: Vitest over Jest
 * - ADR-009: Hybrid memory backend default
 * - ADR-010: Remove Deno support (Node.js 20+ only)
 *
 * @module claude-flow/v3
 * @version 3.0.0-alpha
 */

// =============================================================================
// Core Source Exports
// =============================================================================

export * from './src/index.js';

// =============================================================================
// Swarm Configuration
// =============================================================================

export type {
  V3SwarmConfig,
  DomainConfig,
  PhaseConfig,
  GitHubConfig,
  LoggingConfig,
  TopologyConfig,
  AgentDomain,
  PhaseId,
  TopologyType,
  LoadBalancingStrategy,
  PerformanceTargets
} from './swarm.config.js';

export {
  defaultSwarmConfig,
  agentRoleMapping,
  getAgentsByDomain,
  getAgentConfig,
  getPhaseConfig,
  getActiveAgentsForPhase,
  createCustomConfig,
  topologyConfigs,
  getTopologyConfig,
  V3_PERFORMANCE_TARGETS
} from './swarm.config.js';

// =============================================================================
// Quick Start Functions
// =============================================================================

import type { SwarmConfig } from './src/shared/types/index.js';
import { SwarmCoordinator } from './src/coordination/application/SwarmCoordinator.js';

/**
 * Initialize the V3 swarm with default configuration
 *
 * @example
 * ```typescript
 * import { initializeV3Swarm } from './v3';
 *
 * const swarm = await initializeV3Swarm({ topology: 'hierarchical' });
 *
 * // Spawn agents
 * await swarm.spawnAgent({ id: 'coder-1', type: 'coder' });
 *
 * // Submit a task
 * const result = await swarm.executeTask('coder-1', {
 *   id: 'task-1',
 *   type: 'code',
 *   description: 'Implement feature X',
 *   priority: 'high'
 * });
 * ```
 */
export async function initializeV3Swarm(config?: Partial<SwarmConfig>): Promise<SwarmCoordinator> {
  const coordinator = new SwarmCoordinator({
    topology: config?.topology || 'hierarchical',
    memoryBackend: config?.memoryBackend,
    eventBus: config?.eventBus,
    pluginManager: config?.pluginManager,
    maxAgents: config?.maxAgents
  });
  await coordinator.initialize();
  return coordinator;
}

/**
 * Get a pre-configured swarm coordinator with default settings
 */
export async function getOrCreateSwarm(): Promise<SwarmCoordinator> {
  return initializeV3Swarm();
}

// =============================================================================
// Version Info
// =============================================================================

export const V3_VERSION = {
  major: 3,
  minor: 0,
  patch: 0,
  prerelease: 'alpha',
  full: '3.0.0-alpha',
  buildDate: new Date().toISOString()
};

export const V3_INFO = {
  name: 'claude-flow',
  version: V3_VERSION.full,
  description: 'Complete reimagining of Claude-Flow with multi-agent hierarchical mesh swarm',
  repository: 'https://github.com/ruvnet/claude-flow',
  license: 'MIT',
  engines: {
    node: '>=20.0.0'
  },
  features: [
    'Domain-Driven Design (ADR-002)',
    'Single coordination engine (ADR-003)',
    'Plugin architecture (ADR-004)',
    'MCP-first API (ADR-005)',
    'Unified memory service (ADR-006)',
    'Event sourcing (ADR-007)',
    'Vitest testing (ADR-008)',
    'Hybrid memory backend (ADR-009)',
    'Node.js 20+ focus (ADR-010)'
  ],
  agents: {
    topology: 'hierarchical-mesh',
    domains: ['security', 'core', 'integration', 'quality', 'performance', 'deployment']
  }
};

// =============================================================================
// Default Export
// =============================================================================

export default {
  initializeV3Swarm,
  getOrCreateSwarm,
  version: V3_VERSION,
  info: V3_INFO
};
