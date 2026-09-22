// JS VM browser environment package.
import init, * as runtime from './js_vm_runtime_browser.js';

const maxCallDepth = 2048;
const maxRecursiveCallDepth = 128;
const maxExecutionSteps = 0;
let runtimeReady;

if (typeof globalThis.__jsVmHostLog !== 'function') {
  globalThis.__jsVmHostLog = (level, message) => {
    const method = console && typeof console[level] === 'function' ? console[level] : console.log;
    method.call(console, message);
  };
}

function ensureRuntime() {
  if (!runtimeReady) {
    runtimeReady = init({ module_or_path: new URL('./js_vm_runtime_browser_bg.wasm', import.meta.url) });
  }
  return runtimeReady;
}

export async function loadBin(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`failed to load ${url}: ${response.status} ${response.statusText}`);
  return new Uint8Array(await response.arrayBuffer());
}

export async function loadSourceMap(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`failed to load ${url}: ${response.status} ${response.statusText}`);
  return response.json();
}

export function resolveExternal(name) {
  if (name === '__jsVmIntrinsicDeflateTable') return __jsVmIntrinsicDeflateTable;
  if (name === '__jsVmIntrinsicBitReverseTable') return __jsVmIntrinsicBitReverseTable;
  return String(name).split('.').reduce((value, part) => value == null ? undefined : value[part], globalThis);
}

function __jsVmIntrinsicDeflateTable(Uint16ArrayCtor, Int32ArrayCtor) {
  return function(lengths, base) {
    const bits = new Uint16ArrayCtor(31);
    for (let index = 0; index < 31; ++index) bits[index] = base += 1 << lengths[index - 1];
    const reverse = new Int32ArrayCtor(bits[30]);
    for (let index = 1; index < 30; ++index) {
      for (let value = bits[index]; value < bits[index + 1]; ++value) {
        reverse[value] = ((value - bits[index]) << 5) | index;
      }
    }
    return { b: bits, r: reverse };
  };
}

function __jsVmIntrinsicBitReverseTable(Uint16ArrayCtor) {
  const table = new Uint16ArrayCtor(32768);
  for (let value = 0; value < 32768; ++value) {
    let reversed = ((value & 43690) >> 1) | ((value & 21845) << 1);
    reversed = ((reversed & 52428) >> 2) | ((reversed & 13107) << 2);
    reversed = ((reversed & 61680) >> 4) | ((reversed & 3855) << 4);
    table[value] = (((reversed & 65280) >> 8) | ((reversed & 255) << 8)) >> 1;
  }
  return table;
}

export async function ready() {
  await ensureRuntime();
}

function assertReady() {
  if (!runtimeReady) {
    throw new Error('JS VM runtime is not initialized; call ready() before execute()');
  }
}

export function executeScript(bytes, seed, externs = []) {
  assertReady();
  const run = typeof runtime.js_execute_void_bytes_with_seed_and_runtime_limits === 'function'
    ? runtime.js_execute_void_bytes_with_seed_and_runtime_limits
    : runtime.js_execute_void_bytes_with_seed;
  if (run === runtime.js_execute_void_bytes_with_seed_and_runtime_limits) {
    run(bytes, seed, externs, maxCallDepth, maxRecursiveCallDepth, maxExecutionSteps);
  } else {
    run(bytes, seed, externs);
  }
}

export function executeModule(bytes, seed, externs = []) {
  assertReady();
  const run = typeof runtime.js_execute_module_bytes_with_seed_and_runtime_limits === 'function'
    ? runtime.js_execute_module_bytes_with_seed_and_runtime_limits
    : runtime.js_execute_module_bytes_with_seed;
  if (run === runtime.js_execute_module_bytes_with_seed_and_runtime_limits) {
    return run(bytes, seed, externs, maxCallDepth, maxRecursiveCallDepth, maxExecutionSteps);
  }
  return run(bytes, seed, externs);
}

export function executeDebug(bytes, seed, externs = []) {
  assertReady();
  const run = typeof runtime.js_execute_bytes_with_seed_debug_and_runtime_limits === 'function'
    ? runtime.js_execute_bytes_with_seed_debug_and_runtime_limits
    : runtime.js_execute_bytes_with_seed_debug;
  if (typeof run !== 'function') {
    throw new Error('JS VM runtime was not built with source-map feature');
  }
  if (run === runtime.js_execute_bytes_with_seed_debug_and_runtime_limits) {
    return run(bytes, seed, externs, maxCallDepth, maxRecursiveCallDepth, maxExecutionSteps);
  }
  return run(bytes, seed, externs);
}

export function createDebugSession(bytes, seed, externs = []) {
  assertReady();
  const Session = runtime.JsVmDebugSession;
  if (typeof Session !== 'function') {
    throw new Error('JS VM runtime was not built with debugger feature');
  }
  if (typeof Session.new_with_runtime_limits === 'function') {
    return Session.new_with_runtime_limits(bytes, seed, externs, maxCallDepth, maxRecursiveCallDepth, maxExecutionSteps);
  }
  return new Session(bytes, seed, externs);
}

export function breakpointPcs(sourceMap, breakpoints = []) {
  const list = Array.isArray(breakpoints) ? breakpoints : [breakpoints];
  const vm = sourceMap?.x_js_vm || {};
  const ranges = Array.isArray(vm.pcRanges) ? vm.pcRanges : [];
  const spans = Array.isArray(vm.sourceSpans) ? vm.sourceSpans : [];
  const pcs = new Set();
  for (const breakpoint of list) {
    if (typeof breakpoint === 'number' && Number.isFinite(breakpoint)) {
      pcs.add(Math.max(0, Math.trunc(breakpoint)));
      continue;
    }
    if (!breakpoint || typeof breakpoint !== 'object') continue;
    if (Number.isFinite(Number(breakpoint.pc))) {
      pcs.add(Math.max(0, Math.trunc(Number(breakpoint.pc))));
      continue;
    }
    const line = Number(breakpoint.line);
    const column = Number.isFinite(Number(breakpoint.column)) ? Number(breakpoint.column) : 0;
    if (!Number.isFinite(line)) continue;
    for (const range of ranges) {
      const span = range[5] >= 0 ? spans[range[5]] : null;
      if (!span) continue;
      const inLine = line >= span[2] && line <= span[4];
      const afterStart = line !== span[2] || column >= span[3];
      const beforeEnd = line !== span[4] || column <= span[5];
      if (inLine && afterStart && beforeEnd) {
        pcs.add(range[0]);
        break;
      }
    }
  }
  return Array.from(pcs).sort((a, b) => a - b);
}

export function sourceFrame(sourceMap, pc) {
  const vm = sourceMap?.x_js_vm || {};
  if (Array.isArray(vm.pcRanges)) {
    const range = vm.pcRanges.find((item) => pc >= item[0] && pc < item[1]);
    if (!range) return null;
    const opRange = (vm.pcOps || []).find((item) => pc >= item[0] && pc < item[1]);
    const span = range[5] >= 0 ? vm.sourceSpans?.[range[5]] : null;
    const source = span ? {
      source: 0,
      start: span[0],
      end: span[1],
      line: span[2],
      column: span[3],
      endLine: span[4],
      endColumn: span[5],
    } : null;
    return {
      pc,
      pcStart: range[0],
      pcEnd: range[1],
      op: opRange ? vm.opcodes?.[opRange[2]] : undefined,
      byteStart: range[2],
      byteEnd: range[3],
      function: range[4] >= 0 ? range[4] : null,
      source,
      sourceFile: sourceMap.sources?.[0],
    };
  }
  const frames = vm.pcMap || [];
  const frame = frames.find((item) => item.pc === pc);
  return frame ? { ...frame, sourceFile: sourceMap.sources?.[frame.source?.source ?? 0] } : null;
}

export function decorateDebugEvent(sourceMap, event) {
  const pc = Number(event?.pc);
  const frame = Number.isFinite(pc) ? sourceFrame(sourceMap, pc) : null;
  const callStack = (event?.callStack || []).map((item) => {
    const framePc = Number(item?.pc);
    return {
      ...item,
      source: Number.isFinite(framePc) ? sourceFrame(sourceMap, framePc) : null,
    };
  });
  return { ...event, frame, source: frame?.source || null, callStack };
}

export const execute = executeModule;

await ready();
