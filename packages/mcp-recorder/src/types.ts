export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: unknown;
};

export type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

export type JsonRpcNotification = {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
};

export type RecorderConfig = {
  recorderUrl: string;       // ARCA_RECORDER_URL
  chainId: string;           // ARCA_CHAIN_ID (required)
  actor: string;             // ARCA_ACTOR (default: chainId)
  captureMethods: Set<string>; // ARCA_CAPTURE_METHODS
  logDebug: boolean;         // ARCA_DEBUG
};

export type PendingCall = {
  id: number | string;
  method: string;
  params: unknown;
  startedAt: number;
};
