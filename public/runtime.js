// Generic BPMN-like workflow runtime. No DOM, no workflow-specific knowledge.
// Supports: startEvent, userTask, exclusiveGateway (XOR / XOR_MERGE), endEvent.

const SUPPORTED = new Set(['startEvent', 'userTask', 'exclusiveGateway', 'endEvent']);
const MAX_AUTO_STEPS = 1000;

export async function loadWorkflow(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Cannot load workflow ${url}: HTTP ${res.status}`);
  const workflow = await res.json();
  validateWorkflow(workflow);
  return workflow;
}

export function validateWorkflow(wf) {
  const errors = [];
  if (!wf || typeof wf !== 'object') throw new Error('Workflow is not an object');
  if (!Array.isArray(wf.nodes) || !wf.nodes.length) errors.push('nodes[] missing or empty');
  if (!Array.isArray(wf.flows)) errors.push('flows[] missing');
  if (errors.length) throw new Error(`Invalid workflow: ${errors.join('; ')}`);

  const ids = new Set();
  for (const n of wf.nodes) {
    if (!n.id) errors.push('node without id');
    else if (ids.has(n.id)) errors.push(`duplicate node id ${n.id}`);
    ids.add(n.id);
    if (!SUPPORTED.has(n.bpmn_type)) errors.push(`node ${n.id}: unsupported bpmn_type "${n.bpmn_type}"`);
  }
  for (const f of wf.flows) {
    if (!ids.has(f.source)) errors.push(`flow ${f.id}: unknown source ${f.source}`);
    if (!ids.has(f.target)) errors.push(`flow ${f.id}: unknown target ${f.target}`);
    const expr = f.condition?.expression;
    if (expr != null) {
      try { parseCondition(expr); } catch (e) { errors.push(`flow ${f.id}: ${e.message}`); }
    }
  }
  if (!wf.nodes.some((n) => n.bpmn_type === 'startEvent') && !wf.runtime?.current_node) {
    errors.push('no startEvent and no runtime.current_node');
  }
  if (errors.length) throw new Error(`Invalid workflow: ${errors.join('; ')}`);
}

// Safe condition parser: `variable == true|false|null` and `variable != ...`. No eval.
export function parseCondition(expr) {
  const m = /^\s*([A-Za-z_][\w.]*)\s*(==|!=)\s*(true|false|null)\s*$/.exec(String(expr));
  if (!m) throw new Error(`unsupported condition "${expr}" (expected: variable == true|false)`);
  const value = m[3] === 'true' ? true : m[3] === 'false' ? false : null;
  return { variable: m[1], op: m[2], value };
}

export function evaluateCondition(expr, variables) {
  const { variable, op, value } = parseCondition(expr);
  const actual = variables[variable] === undefined ? null : variables[variable];
  return op === '==' ? actual === value : actual !== value;
}

export function createPlayer(workflow) {
  const nodesById = new Map(workflow.nodes.map((n) => [n.id, n]));
  const listeners = new Set();
  let state;
  let depth = 0;

  const notify = () => { if (depth === 0) for (const l of listeners) l(state); };
  const batch = (fn) => { depth++; try { return fn(); } finally { depth--; notify(); } };

  const getNode = (id) => nodesById.get(id);
  const getOutgoingFlows = (id) => workflow.flows.filter((f) => f.source === id);
  const current = () => getNode(state.currentNodeId);

  // A gateway needs a user decision when any outgoing flow carries a condition.
  function needsDecision(node) {
    return node.bpmn_type === 'exclusiveGateway' && getOutgoingFlows(node.id).some((f) => f.condition?.expression);
  }

  function decisionVariable(node) {
    if (node.gateway?.decision_variable) return node.gateway.decision_variable;
    for (const f of getOutgoingFlows(node.id)) {
      if (f.condition?.expression) return parseCondition(f.condition.expression).variable;
    }
    return null;
  }

  function fail(message) {
    state.status = 'error';
    state.error = message;
  }

  function pickFlow(node) {
    const flows = getOutgoingFlows(node.id);
    if (!flows.length) return null;
    const conditional = flows.filter((f) => f.condition?.expression);
    const hit = conditional.find((f) => evaluateCondition(f.condition.expression, state.variables));
    if (hit) return hit;
    return flows.find((f) => !f.condition?.expression) ?? null;
  }

  function resetWorkflow() {
    return batch(() => {
      const start = workflow.nodes.find((n) => n.bpmn_type === 'startEvent');
      const first = workflow.runtime?.current_node ?? start?.id;
      state = {
        currentNodeId: null,
        variables: { ...(workflow.runtime?.variables ?? {}) },
        nodeStates: Object.fromEntries(workflow.nodes.map((n) => [n.id, 'pending'])),
        anchors: {},
        status: 'running', // running | complete | error
        error: null,
        steps: 0,
      };
      if (start && start.id !== first) state.nodeStates[start.id] = 'completed';
      enterNode(first);
      return state;
    });
  }

  function enterNode(nodeId) {
    return batch(() => {
      const node = getNode(nodeId);
      if (!node) return fail(`Unknown node ${nodeId}`);
      if (++state.steps > MAX_AUTO_STEPS) return fail('Too many automatic steps (cycle?)');
      state.currentNodeId = nodeId;
      switch (node.bpmn_type) {
        case 'startEvent':
          state.nodeStates[nodeId] = 'completed';
          return advance();
        case 'userTask':
          state.nodeStates[nodeId] = 'active';
          return;
        case 'exclusiveGateway':
          if (needsDecision(node)) { state.nodeStates[nodeId] = 'active'; return; }
          state.nodeStates[nodeId] = 'completed'; // merge / pass-through
          return advance();
        case 'endEvent':
          state.nodeStates[nodeId] = 'completed';
          state.status = 'complete';
          return;
        default:
          return fail(`Unsupported node type ${node.bpmn_type}`);
      }
    });
  }

  // Follow the outgoing flow of the current node. Waits if the current node still needs input.
  function advance() {
    return batch(() => {
      if (state.status !== 'running') return;
      const node = current();
      if (node.bpmn_type === 'endEvent') return;
      if (node.bpmn_type === 'userTask' && state.nodeStates[node.id] === 'active') return;
      if (needsDecision(node) && state.variables[decisionVariable(node)] == null) return;
      const flow = pickFlow(node);
      if (!flow) return fail(`No outgoing flow from ${node.id}${needsDecision(node) ? ' matches current variables' : ''}`);
      enterNode(flow.target);
    });
  }

  function setVariable(name, value) {
    return batch(() => { state.variables[name] = value; });
  }

  function resolveExclusiveGateway() {
    return batch(() => {
      const node = current();
      if (!node || node.bpmn_type !== 'exclusiveGateway') return;
      if (needsDecision(node) && state.variables[decisionVariable(node)] == null) return;
      state.nodeStates[node.id] = 'completed';
      advance();
    });
  }

  function answerGateway(value) {
    return batch(() => {
      const node = current();
      if (!node || node.bpmn_type !== 'exclusiveGateway') return;
      setVariable(decisionVariable(node), value);
      resolveExclusiveGateway();
    });
  }

  function completeTask() {
    return batch(() => {
      if (current()?.bpmn_type !== 'userTask') return;
      state.nodeStates[state.currentNodeId] = 'completed';
      advance();
    });
  }

  function skipTask() {
    return batch(() => {
      if (current()?.bpmn_type !== 'userTask') return;
      state.nodeStates[state.currentNodeId] = 'skipped';
      advance();
    });
  }

  // Grounding: which tap is the current userTask waiting for? 'source' | 'target' | 'ready'.
  function groundingStage(nodeId = state.currentNodeId) {
    const ar = getNode(nodeId)?.ar;
    if (!ar?.anchor?.label) return 'ready';
    const a = state.anchors[nodeId];
    if (!a?.source) return 'source';
    if (ar.target_anchor?.label && !a.target) return 'target';
    return 'ready';
  }

  function setAnchorPoint(point, nodeId = state.currentNodeId) {
    return batch(() => {
      const stage = groundingStage(nodeId);
      if (stage === 'ready') return;
      const a = (state.anchors[nodeId] ??= {});
      a[stage] = { x: point.x, y: point.y };
    });
  }

  function clearAnchors(nodeId = state.currentNodeId) {
    return batch(() => { delete state.anchors[nodeId]; });
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  resetWorkflow();

  return {
    workflow,
    get state() { return state; },
    getNode, getOutgoingFlows, enterNode, completeTask, skipTask, setVariable,
    resolveExclusiveGateway, answerGateway, advance, resetWorkflow,
    needsDecision, decisionVariable, groundingStage, setAnchorPoint, clearAnchors, subscribe,
  };
}
