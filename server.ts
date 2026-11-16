import crypto from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import { WebSocket, WebSocketServer } from 'ws';
import type {
  OutputRenderItem,
  TelemetryLogEntry,
  TelemetrySnapshot,
  TelemetryStage,
} from './src/types/automation';
import { createMacTrialZipBuffer } from './src/utils/macPackage';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === 'production';
const portArgIdx = process.argv.indexOf('--port');
const cliPort =
  portArgIdx !== -1 && process.argv[portArgIdx + 1]
    ? Number(process.argv[portArgIdx + 1])
    : NaN;
const PORT = Number(
  (Number.isFinite(cliPort) && cliPort > 0 ? cliPort : null) ??
    (isProduction ? process.env.PORT : null) ??
    3000
);

const VALID_TELEMETRY_STAGES: TelemetryStage[] = [
  'idle',
  'preflight',
  'downloading',
  'injecting',
  'rendering',
  'saving_local',
  'backing_up_drive',
  'completed',
  'aborted',
];

function createInitialTelemetrySnapshot(): TelemetrySnapshot {
  return {
    sessionId: null,
    stage: 'idle',
    gpuName: null,
    vramUsedGb: null,
    vramTotalGb: null,
    systemRamUsedGb: null,
    systemRamTotalGb: null,
    gpuTempC: null,
    diskFreeGb: null,
    downloadProgressPct: null,
    activeProjectId: null,
    activeBatchJobId: null,
    batchIndex: 0,
    batchTotal: 0,
    currentStepLabel: 'Colab MCP / Oturum bağlantısı bekleniyor',
    lastUpdatedAt: null,
    logs: [],
  };
}

function isAllowedWebhookUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
      host.endsWith('.internal') ||
      host.endsWith('.local')
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function toFiniteNumber(val: unknown): number | null {
  return typeof val === 'number' && Number.isFinite(val) ? Number(val.toFixed(2)) : null;
}

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  const ingestToken =
    process.env.COLABFORGE_TELEMETRY_TOKEN?.trim() || crypto.randomBytes(16).toString('hex');
  let telemetryState: TelemetrySnapshot = createInitialTelemetrySnapshot();
  const wsClients = new Set<WebSocket>();

  function broadcastWs(payload: unknown) {
    const serialized = JSON.stringify(payload);
    for (const client of wsClients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(serialized);
      }
    }
  }

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'colabforge-api',
      wsClients: wsClients.size,
      telemetryStage: telemetryState.stage,
    });
  });

  app.get('/api/download/mac-trial', async (req, res) => {
    try {
      const rawOrigin = typeof req.query.origin === 'string' ? req.query.origin : null;
      const fallbackHost = req.get('host') ?? null;
      const { buffer } = await createMacTrialZipBuffer(rawOrigin, fallbackHost);

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="ColabForge-Mac-Deneme.zip"'
      );
      res.setHeader('Cache-Control', 'no-store');
      res.send(buffer);
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: `MacBook paketi oluşturulamadı: ${
          err instanceof Error ? err.message : 'Bilinmeyen hata'
        }`,
      });
    }
  });

  app.get('/api/telemetry/state', (_req, res) => {
    res.json({
      ok: true,
      ingestToken,
      state: telemetryState,
    });
  });

  app.post('/api/telemetry/ingest', (req, res) => {
    const suppliedToken = req.header('x-telemetry-token')?.trim();
    if (suppliedToken !== ingestToken) {
      res.status(401).json({
        ok: false,
        error: 'Geçersiz veya eksik x-telemetry-token başlığı.',
      });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const stageRaw = typeof body.stage === 'string' ? (body.stage as TelemetryStage) : null;
    const nextStage: TelemetryStage =
      stageRaw && VALID_TELEMETRY_STAGES.includes(stageRaw) ? stageRaw : telemetryState.stage;

    const nowIso = new Date().toISOString();
    const logMessage =
      typeof body.logLine === 'string' && body.logLine.trim()
        ? body.logLine.trim().slice(0, 400)
        : null;
    const logLevelRaw = body.logLevel;
    const logLevel: TelemetryLogEntry['level'] =
      logLevelRaw === 'warn' || logLevelRaw === 'error' || logLevelRaw === 'success'
        ? logLevelRaw
        : nextStage === 'aborted'
          ? 'error'
          : nextStage === 'completed'
            ? 'success'
            : 'info';

    const nextLogs = logMessage
      ? [
          {
            id: `tlog-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            timestamp: nowIso.slice(11, 19),
            level: logLevel,
            message: logMessage,
          },
          ...telemetryState.logs,
        ].slice(0, 60)
      : telemetryState.logs;

    telemetryState = {
      sessionId:
        typeof body.sessionId === 'string' && body.sessionId.trim()
          ? body.sessionId.trim()
          : telemetryState.sessionId || `colab-${nowIso.slice(11, 19)}`,
      stage: nextStage,
      gpuName:
        typeof body.gpuName === 'string' && body.gpuName.trim()
          ? body.gpuName.trim()
          : telemetryState.gpuName,
      vramUsedGb: toFiniteNumber(body.vramUsedGb) ?? telemetryState.vramUsedGb,
      vramTotalGb: toFiniteNumber(body.vramTotalGb) ?? telemetryState.vramTotalGb,
      systemRamUsedGb:
        toFiniteNumber(body.systemRamUsedGb) ?? telemetryState.systemRamUsedGb,
      systemRamTotalGb:
        toFiniteNumber(body.systemRamTotalGb) ?? telemetryState.systemRamTotalGb,
      gpuTempC: toFiniteNumber(body.gpuTempC) ?? telemetryState.gpuTempC,
      diskFreeGb: toFiniteNumber(body.diskFreeGb) ?? telemetryState.diskFreeGb,
      downloadProgressPct:
        toFiniteNumber(body.downloadProgressPct) ?? telemetryState.downloadProgressPct,
      activeProjectId:
        typeof body.activeProjectId === 'string'
          ? body.activeProjectId
          : telemetryState.activeProjectId,
      activeBatchJobId:
        typeof body.activeBatchJobId === 'string'
          ? body.activeBatchJobId
          : telemetryState.activeBatchJobId,
      batchIndex:
        typeof body.batchIndex === 'number' && Number.isFinite(body.batchIndex)
          ? Math.max(0, Math.floor(body.batchIndex))
          : telemetryState.batchIndex,
      batchTotal:
        typeof body.batchTotal === 'number' && Number.isFinite(body.batchTotal)
          ? Math.max(0, Math.floor(body.batchTotal))
          : telemetryState.batchTotal,
      currentStepLabel:
        typeof body.currentStepLabel === 'string' && body.currentStepLabel.trim()
          ? body.currentStepLabel.trim()
          : telemetryState.currentStepLabel,
      lastUpdatedAt: nowIso,
      logs: nextLogs,
    };

    broadcastWs({ type: 'telemetry:update', state: telemetryState });
    res.json({ ok: true, state: telemetryState });
  });

  app.post('/api/telemetry/output', (req, res) => {
    const suppliedToken = req.header('x-telemetry-token')?.trim();
    if (suppliedToken !== ingestToken) {
      res.status(401).json({
        ok: false,
        error: 'Geçersiz veya eksik x-telemetry-token başlığı.',
      });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const projectId =
      typeof body.projectId === 'string' && body.projectId.trim()
        ? body.projectId.trim()
        : telemetryState.activeProjectId;
    const fileName =
      typeof body.fileName === 'string' && body.fileName.trim()
        ? body.fileName.trim()
        : 'render_output.mp4';

    if (!projectId) {
      res.status(400).json({ ok: false, error: 'projectId zorunludur.' });
      return;
    }

    const gpuUsed: OutputRenderItem['gpuUsed'] =
      body.gpuUsed === 'A100 40GB' ? 'A100 40GB' : 'A100 80GB';
    const outputItem: OutputRenderItem = {
      id: `out-${Date.now()}`,
      title:
        typeof body.title === 'string' && body.title.trim()
          ? body.title.trim()
          : fileName,
      fileName,
      relativeOutputPath:
        typeof body.relativeOutputPath === 'string' && body.relativeOutputPath.trim()
          ? body.relativeOutputPath.trim()
          : `05_outputs/renders/${fileName}`,
      createdAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
      gpuUsed,
      durationSec: toFiniteNumber(body.durationSec) ?? 5.0,
      resolution:
        typeof body.resolution === 'string' && body.resolution.trim()
          ? body.resolution.trim()
          : '1280x720',
      status: 'tamamlandi',
      mimeType:
        typeof body.mimeType === 'string' && body.mimeType.trim()
          ? body.mimeType.trim()
          : 'video/mp4',
      notes: [],
    };

    broadcastWs({
      type: 'telemetry:output',
      projectId,
      batchJobId: typeof body.batchJobId === 'string' ? body.batchJobId : null,
      output: outputItem,
    });
    res.json({ ok: true, output: outputItem });
  });

  app.post('/api/telemetry/reset', (_req, res) => {
    telemetryState = createInitialTelemetrySnapshot();
    broadcastWs({ type: 'telemetry:update', state: telemetryState });
    res.json({ ok: true, state: telemetryState });
  });

  app.post('/api/hf/verify', async (req, res) => {
    const repoId = typeof req.body?.repoId === 'string' ? req.body.repoId.trim() : '';
    if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repoId)) {
      res.status(400).json({
        ok: false,
        status: 400,
        error: 'Geçersiz HuggingFace repo formatı. Örnek: MiniMaxAI/MiniMax-M1-80k',
      });
      return;
    }

    const tokenHeader = req.header('x-hf-token')?.trim();
    const [owner, modelName] = repoId.split('/');
    const apiUrl = `https://huggingface.co/api/models/${encodeURIComponent(owner)}/${encodeURIComponent(modelName)}?blobs=true`;

    try {
      const headers: Record<string, string> = {
        Accept: 'application/json',
        'User-Agent': 'ColabForge-Preflight/1.0',
      };
      if (tokenHeader) {
        headers.Authorization = `Bearer ${tokenHeader}`;
      }

      const hfRes = await fetch(apiUrl, { headers });
      if (!hfRes.ok) {
        const message =
          hfRes.status === 404
            ? `Repo bulunamadı (404): ${repoId}`
            : hfRes.status === 401 || hfRes.status === 403
              ? `Erişim reddedildi (${hfRes.status}): Gated/özel repo için geçerli HF_TOKEN gerekli.`
              : `HuggingFace API hatası (${hfRes.status})`;
        res.status(200).json({
          ok: false,
          status: hfRes.status,
          repoId,
          error: message,
        });
        return;
      }

      const data = (await hfRes.json()) as {
        id?: string;
        sha?: string;
        private?: boolean;
        gated?: boolean | string;
        pipeline_tag?: string;
        siblings?: Array<{ rfilename?: string; size?: number }>;
      };

      const siblings = Array.isArray(data.siblings) ? data.siblings : [];
      const safetensorBytes = siblings
        .filter((s) => typeof s.rfilename === 'string' && s.rfilename.endsWith('.safetensors'))
        .reduce((sum, s) => sum + (typeof s.size === 'number' ? s.size : 0), 0);
      const totalBytes = siblings.reduce(
        (sum, s) => sum + (typeof s.size === 'number' ? s.size : 0),
        0
      );

      res.json({
        ok: true,
        status: 200,
        repoId: data.id || repoId,
        sha: data.sha ? data.sha.slice(0, 8) : null,
        private: Boolean(data.private),
        gated: Boolean(data.gated),
        pipelineTag: data.pipeline_tag || null,
        fileCount: siblings.length,
        totalSafetensorsGb: Number((safetensorBytes / 1024 ** 3).toFixed(2)),
        totalRepoGb: Number((totalBytes / 1024 ** 3).toFixed(2)),
      });
    } catch (err) {
      res.status(502).json({
        ok: false,
        status: 502,
        repoId,
        error: `HuggingFace API bağlantısı kurulamadı: ${err instanceof Error ? err.message : 'Bilinmeyen hata'}`,
      });
    }
  });

  app.post('/api/webhook/test', async (req, res) => {
    const webhookUrl =
      typeof req.body?.webhookUrl === 'string' ? req.body.webhookUrl.trim() : '';
    const customMsg =
      typeof req.body?.message === 'string' && req.body.message.trim()
        ? req.body.message.trim()
        : '[ColabForge] Test bildirimi: MiniMax H3 Guardrail webhook bağlantısı doğrulandı.';

    if (!isAllowedWebhookUrl(webhookUrl)) {
      res.status(400).json({
        ok: false,
        error: 'Geçerli bir herkese açık HTTPS webhook adresi girin (Discord/Slack vb.).',
      });
      return;
    }

    try {
      const hookRes = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: customMsg, text: customMsg }),
      });

      if (!hookRes.ok) {
        res.status(200).json({
          ok: false,
          status: hookRes.status,
          error: `Webhook hedefi ${hookRes.status} döndürdü.`,
        });
        return;
      }

      res.json({ ok: true, status: hookRes.status });
    } catch (err) {
      res.status(502).json({
        ok: false,
        error: `Webhook gönderilemedi: ${err instanceof Error ? err.message : 'Ağ hatası'}`,
      });
    }
  });

  function attachTelemetryWebSocket(httpServer: http.Server) {
    const wss = new WebSocketServer({ noServer: true });

    wss.on('connection', (socket) => {
      wsClients.add(socket);
      socket.send(JSON.stringify({ type: 'telemetry:init', state: telemetryState }));

      socket.on('close', () => {
        wsClients.delete(socket);
      });
      socket.on('error', () => {
        wsClients.delete(socket);
      });
    });

    httpServer.on('upgrade', (request, socket, head) => {
      if (request.url?.startsWith('/ws/telemetry')) {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      }
    });

    return wss;
  }

  return { app, attachTelemetryWebSocket, getTelemetryState: () => telemetryState, ingestToken };
}

async function startServer() {
  const { app, attachTelemetryWebSocket } = createApp();
  const httpServer = http.createServer(app);
  attachTelemetryWebSocket(httpServer);

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`ColabForge server listening on http://0.0.0.0:${PORT}`);
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  startServer();
}
