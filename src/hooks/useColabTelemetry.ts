import { useCallback, useEffect, useRef, useState } from 'react';
import { OutputRenderItem, TelemetrySnapshot } from '../types/automation';

const INITIAL_TELEMETRY: TelemetrySnapshot = {
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

interface UseColabTelemetryOptions {
  onOutputReceived?: (
    projectId: string,
    batchJobId: string | null,
    output: OutputRenderItem
  ) => void;
}

export interface BridgeRuntimePreset {
  gpuName?: string;
  vramUsedGb?: number;
  vramTotalGb?: number;
  systemRamUsedGb?: number;
  systemRamTotalGb?: number;
  diskFreeGb?: number;
  logLine?: string;
}

export function useColabTelemetry(options?: UseColabTelemetryOptions) {
  const [telemetry, setTelemetry] = useState<TelemetrySnapshot>(INITIAL_TELEMETRY);
  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'disconnected'>(
    'connecting'
  );
  const [ingestToken, setIngestToken] = useState<string>('');
  const [pingSending, setPingSending] = useState(false);

  const onOutputRef = useRef(options?.onOutputReceived);
  onOutputRef.current = options?.onOutputReceived;

  useEffect(() => {
    let active = true;
    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;

    async function loadInitialState() {
      try {
        const res = await fetch('/api/telemetry/state');
        if (!res.ok) return;
        const data = (await res.json()) as {
          ok: boolean;
          ingestToken?: string;
          state?: TelemetrySnapshot;
        };
        if (!active) return;
        if (data.ingestToken) setIngestToken(data.ingestToken);
        if (data.state) setTelemetry(data.state);
      } catch {
        // Initial fetch failure handled by WebSocket connect attempt
      }
    }

    function connectWebSocket() {
      if (!active) return;
      setWsStatus('connecting');
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/telemetry`;
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        if (!active) return;
        setWsStatus('connected');
      };

      ws.onmessage = (event) => {
        if (!active) return;
        try {
          const msg = JSON.parse(event.data as string) as
            | { type: 'telemetry:init'; state: TelemetrySnapshot }
            | { type: 'telemetry:update'; state: TelemetrySnapshot }
            | {
                type: 'telemetry:output';
                projectId: string;
                batchJobId: string | null;
                output: OutputRenderItem;
              };
          if (msg.type === 'telemetry:init' || msg.type === 'telemetry:update') {
            setTelemetry(msg.state);
          } else if (msg.type === 'telemetry:output' && onOutputRef.current) {
            onOutputRef.current(msg.projectId, msg.batchJobId, msg.output);
          }
        } catch {
          // Ignore malformed WS frame
        }
      };

      ws.onclose = () => {
        if (!active) return;
        setWsStatus('disconnected');
        reconnectTimer = window.setTimeout(connectWebSocket, 3000);
      };

      ws.onerror = () => {
        ws?.close();
      };
    }

    void loadInitialState();
    connectWebSocket();

    return () => {
      active = false;
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }
      ws?.close();
    };
  }, []);

  const sendBridgePing = useCallback(
    async (projectId: string, batchTotal: number, preset?: BridgeRuntimePreset) => {
      if (!ingestToken) return;
      setPingSending(true);
      const gpuName = preset?.gpuName ?? 'NVIDIA A100-SXM4-80GB';
      const vramTotalGb = preset?.vramTotalGb ?? 80;
      const vramUsedGb = preset?.vramUsedGb ?? 2.4;
      const systemRamTotalGb = preset?.systemRamTotalGb ?? 167;
      const systemRamUsedGb = preset?.systemRamUsedGb ?? 18.6;
      const diskFreeGb = preset?.diskFreeGb ?? 231.5;
      try {
        await fetch('/api/telemetry/ingest', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-telemetry-token': ingestToken,
          },
          body: JSON.stringify({
            sessionId: `bridge-verify-${vramTotalGb}gb`,
            stage: 'preflight',
            gpuName,
            vramUsedGb,
            vramTotalGb,
            systemRamUsedGb,
            systemRamTotalGb,
            gpuTempC: 41,
            diskFreeGb,
            downloadProgressPct: 100,
            activeProjectId: projectId,
            batchIndex: batchTotal > 0 ? 1 : 0,
            batchTotal,
            currentStepLabel: `Bağlantı doğrulandı (${gpuName})`,
            logLine:
              preset?.logLine ??
              `Canlı köprü testi: ${gpuName} (${vramTotalGb} GB VRAM / ${systemRamTotalGb} GB RAM) telemetri paketi alındı.`,
            logLevel: vramTotalGb < 38 ? 'warn' : 'success',
          }),
        });
      } finally {
        setPingSending(false);
      }
    },
    [ingestToken]
  );

  const resetTelemetry = useCallback(async () => {
    await fetch('/api/telemetry/reset', { method: 'POST' });
  }, []);

  return {
    telemetry,
    wsStatus,
    ingestToken,
    pingSending,
    sendBridgePing,
    resetTelemetry,
  };
}
