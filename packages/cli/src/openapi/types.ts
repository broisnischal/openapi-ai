export interface ParsedSpec {
  id: string;
  name: string;
  url: string | null;
  raw: string;
  title: string;
  version: string;
  baseUrl: string;
  operations: ParsedOperation[];
  securitySchemes: Record<string, ParsedSecurityScheme>;
}

export interface ParsedOperation {
  operationId: string;
  method: string;
  path: string;
  summary?: string;
  description?: string;
  tags: string[];
  parameters: ParsedParameter[];
  requestBody?: ParsedRequestBody;
  responses: Record<string, ParsedResponse>;
  security?: SecurityRequirement[];
}

export interface ParsedParameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  description?: string;
  required: boolean;
  schema: JsonSchema;
}

export interface ParsedRequestBody {
  description?: string;
  required: boolean;
  contentType: string; // e.g. 'application/json'
  schema: JsonSchema;
}

export interface ParsedResponse {
  description?: string;
  contentType?: string;
  schema?: JsonSchema;
}

export interface ParsedSecurityScheme {
  type: 'apiKey' | 'http' | 'oauth2' | 'openIdConnect';
  scheme?: string; // for http: bearer | basic
  in?: 'header' | 'query' | 'cookie'; // for apiKey
  name?: string; // for apiKey: the header/query name
  flows?: OAuthFlows;
  openIdConnectUrl?: string;
}

export interface OAuthFlows {
  clientCredentials?: OAuthFlow;
  authorizationCode?: OAuthFlow;
  implicit?: OAuthFlow;
  password?: OAuthFlow;
}

export interface OAuthFlow {
  tokenUrl?: string;
  authorizationUrl?: string;
  refreshUrl?: string;
  scopes: Record<string, string>;
}

export type SecurityRequirement = Record<string, string[]>;

export type JsonSchema = {
  type?: string | string[];
  format?: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  enum?: unknown[];
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
  oneOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  allOf?: JsonSchema[];
  $ref?: string;
  // MCP extensions for param routing
  'x-param-in'?: 'path' | 'query' | 'header' | 'cookie' | 'body';
  'x-param-name'?: string; // original name (before sanitization)
  [key: string]: unknown;
};
