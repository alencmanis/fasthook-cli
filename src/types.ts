export type FasthookConfig = {
  apiKey?: string;
  destinationId?: string;
  tunnelUrl?: string;
  defaultLocalUrl?: string;
};

export type DeliveryRequest = {
  teamId?: string | null;
  destinationId?: string | null;
  localUrl?: string | null;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  requestId?: string | null;
  eventId?: string | null;
  connectionId?: string | null;
  eventDataId?: string | null;
  sourcePayloadR2Key?: string | null;
  processedR2Key?: string | null;
};

export type DeliveryMessage = {
  type: "delivery";
  jobId: string;
  request: DeliveryRequest;
};

export type DeliveryResult = {
  status: number;
  statusText: string;
  headers?: Record<string, string>;
  body?: string;
};

export type TunnelOptions = {
  apiKey: string;
  destinationId: string;
  localUrl: string | null;
  tunnelUrl: string;
  verbose: boolean;
  quiet: boolean;
};
