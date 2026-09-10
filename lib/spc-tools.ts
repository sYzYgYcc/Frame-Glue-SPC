import { LINES, isProduct, type Assignments, type Assignment } from './spc';

export type SpcTool = {
  name: string; title: string; description: string; inputSchema: object;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (input: unknown) => unknown;
};
export type SpcContext = {
  registerTool: (tool: SpcTool, options: { signal: AbortSignal }) => void | Promise<void>;
};
export function parseProductUpdates(input: unknown): Record<string, Assignment> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Expected an object with products.');
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some(key => key !== 'products') || !value.products || typeof value.products !== 'object' || Array.isArray(value.products)) throw new Error('Expected a products object.');
  const products = value.products as Record<string, unknown>;
  if (!Object.keys(products).length) throw new Error('Provide at least one line assignment.');
  for (const [line, product] of Object.entries(products)) {
    if (!LINES.some(l => l.id === line) || (product !== 'unassigned' && !isProduct(product))) throw new Error('Each line must be L1–L8 and each product must be 72 HBD, 78 HBD, or unassigned.');
  }
  return products as Record<string, Assignment>;
}
export function registerSpcTools(context: SpcContext | undefined, actions: { read: () => { assignments: Assignments; recordCount: number }; save: (products: Record<string, Assignment>) => Assignments }) {
  if (!context?.registerTool) return () => {};
  const controller = new AbortController();
  const registrations: SpcTool[] = [{
    name: 'read_sample_spc_settings', title: 'Read sample SPC settings',
    description: 'Read saved line product assignments and the loaded sample reading count.',
    inputSchema: {type:'object',properties:{},additionalProperties:false},
    annotations:{readOnlyHint:true,untrustedContentHint:false},
    execute: () => actions.read(),
  }, {
    name:'save_sample_line_products', title:'Save sample line products',
    description:'Save one or more line product assignments in this browser and update sample evaluation. Applies to the full imported sample, not machine recipes or production history.',
    inputSchema:{type:'object',properties:{products:{type:'object',minProperties:1,properties:Object.fromEntries(LINES.map(l=>[l.id,{type:'string',enum:['72 HBD','78 HBD','unassigned']}])),additionalProperties:false}},required:['products'],additionalProperties:false},
    annotations:{readOnlyHint:false,untrustedContentHint:false},
    execute:input=>({assignments:actions.save(parseProductUpdates(input)),scope:'browser-local-sample'}),
  }];
  for (const tool of registrations) {
    try { void Promise.resolve(context.registerTool(tool,{signal:controller.signal})).catch(() => {}); }
    catch { /* Optional WebMCP support must not interrupt the dashboard. */ }
  }
  return () => controller.abort();
}
