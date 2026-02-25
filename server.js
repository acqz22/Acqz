import express from 'express';
import cors from 'cors';
import { validateLeadRequest } from './src/contracts/unifiedSchemas.js';
import { createJob, getJob } from './src/orchestration/jobOrchestrator.js';
import { handleMcpRequest } from './src/mcp/server.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/', (_req, res) => {
  res.json({
    service: 'Acqz Lead Engine',
    version: '2.0.0',
    endpoints: ['/jobs', '/jobs/:id', '/mcp'],
  });
});

app.post('/jobs', (req, res) => {
  const validation = validateLeadRequest(req.body);
  if (!validation.valid) {
    return res.status(400).json({ success: false, errors: validation.errors });
  }
  const job = createJob(validation.normalized);
  return res.status(202).json({ success: true, jobId: job.id, status: job.status });
});

app.get('/jobs/:id', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) {
    return res.status(404).json({ success: false, error: 'Job not found' });
  }
  return res.json({ success: true, job });
});

app.post('/mcp', async (req, res) => {
  const response = await handleMcpRequest(req.body);
  res.json(response);
});

const port = Number(process.env.PORT || 10000);
app.listen(port, () => {
  console.log(`Acqz lead engine listening on port ${port}`);
});
