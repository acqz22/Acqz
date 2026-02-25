import { createJob, getJob } from '../orchestration/jobOrchestrator.js';
import { validateLeadRequest } from '../contracts/unifiedSchemas.js';

export async function handleMcpRequest(message) {
  if (message.method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id: message.id,
      result: {
        tools: [
          {
            name: 'leadgen.run',
            description: 'Run multi-platform lead discovery job using the unified actor ecosystem.',
          },
          {
            name: 'leadgen.status',
            description: 'Get status/result for a submitted lead discovery job.',
          },
        ],
      },
    };
  }

  if (message.method === 'tools/call') {
    const { name, arguments: args } = message.params;

    if (name === 'leadgen.run') {
      const validation = validateLeadRequest(args);
      if (!validation.valid) {
        return { jsonrpc: '2.0', id: message.id, error: { code: -32602, message: validation.errors.join('; ') } };
      }
      const job = createJob(validation.normalized);
      return { jsonrpc: '2.0', id: message.id, result: { jobId: job.id, status: job.status } };
    }

    if (name === 'leadgen.status') {
      const job = getJob(args.jobId);
      if (!job) {
        return { jsonrpc: '2.0', id: message.id, error: { code: -32004, message: 'job not found' } };
      }
      return { jsonrpc: '2.0', id: message.id, result: { status: job.status, output: job.output, errors: job.errors } };
    }
  }

  return { jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Method not found' } };
}
