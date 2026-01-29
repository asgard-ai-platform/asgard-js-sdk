# Deprecation Proposal: Migrate from `endpoint` to `botProviderEndpoint`

## Overview

This proposal outlines the deprecation of the `endpoint` configuration option in favor of using `botProviderEndpoint` as the single source of truth for the bot provider service URL. The SSE endpoint will be automatically derived from the bot provider endpoint.

## Background

Currently, the SDK requires two separate endpoint configurations:

- `endpoint`: The full SSE endpoint URL (e.g., `https://api.example.com/ns/xxx/bot-provider/bp-xxx/message/sse`)
- `botProviderEndpoint`: The base bot provider URL (e.g., `https://api.example.com/ns/xxx/bot-provider/bp-xxx`)

This creates redundancy and potential for configuration errors, as the `endpoint` is always `botProviderEndpoint + '/message/sse'`.

## Current State Analysis

### Core Package (`@asgard-js/core`)

- `endpoint` is a required field in the `ClientConfig` interface
- Used by `AsgardServiceClient` for SSE communication
- Passed to `createSseObservable` for making SSE requests

### React Package (`@asgard-js/react`)

- `botProviderEndpoint` is optional in `ClientConfig`
- Used in `getBotProviderModels` for fetching metadata
- Used in app initialization context for loading configuration

### Demo Applications

- Currently configure both `endpoint` and `botProviderEndpoint` separately

## Proposed Changes

### Phase 1: Core Package Updates

#### 1. Update ClientConfig Interface

```typescript
// packages/core/src/types/client.ts
export interface ClientConfig extends SseHandlers {
  /**
   * @deprecated Use `botProviderEndpoint` instead. This will be removed in the next major version.
   * If provided, it will be used. Otherwise, it will be derived as `${botProviderEndpoint}/message/sse`
   */
  endpoint?: string;

  /**
   * Base URL for the bot provider service.
   * The SSE endpoint will be derived as `${botProviderEndpoint}/message/sse`
   */
  botProviderEndpoint?: string;

  apiKey?: string;
  debugMode?: boolean;
  transformSsePayload?: (payload: FetchSsePayload) => FetchSsePayload;
}
```

#### 2. Update AsgardServiceClient Constructor

```typescript
// packages/core/src/lib/client.ts
constructor(config: ClientConfig) {
  // Derive endpoint from botProviderEndpoint if not provided
  if (!config.endpoint && !config.botProviderEndpoint) {
    throw new Error('Either endpoint or botProviderEndpoint must be provided');
  }

  if (!config.endpoint && config.botProviderEndpoint) {
    // Derive endpoint from botProviderEndpoint
    this.endpoint = `${config.botProviderEndpoint}/message/sse`;
  } else if (config.endpoint) {
    // Use provided endpoint but warn about deprecation
    this.endpoint = config.endpoint;
    if (config.debugMode) {
      console.warn(
        '[AsgardServiceClient] The "endpoint" option is deprecated and will be removed in the next major version. ' +
        'Please use "botProviderEndpoint" instead. The SSE endpoint will be automatically derived as "${botProviderEndpoint}/message/sse".'
      );
    }
  }

  this.apiKey = config.apiKey;
  this.debugMode = config.debugMode;
  this.transformSsePayload = config.transformSsePayload;
}
```

### Phase 2: React Package Updates

No changes needed to the React package as it already uses `botProviderEndpoint` correctly. The package will automatically benefit from the core package updates.

### Phase 3: Demo Application Updates

#### Update React Demo Configuration

```typescript
// Example usage
<Chatbot
  config={{
    // Remove endpoint, only use botProviderEndpoint
    botProviderEndpoint: VITE_BOT_PROVIDER_ENDPOINT,
    apiKey: VITE_API_KEY,
  }}
  // ... other props
/>
```

#### Update Environment Variables

Remove `VITE_ENDPOINT` from `.env` files and update `.env.example`:

```env
# Remove this line:
# VITE_ENDPOINT=https://api.dev.asgard-ai.com/.../message/sse

# Keep only:
VITE_BOT_PROVIDER_ENDPOINT=https://api.dev.asgard-ai.com/.../bot-provider/bp-xxx
VITE_API_KEY=your-api-key
```

## Migration Guide

### For SDK Users

#### Before (Current Usage)

```typescript
const client = new AsgardServiceClient({
  endpoint: 'https://api.example.com/ns/xxx/bot-provider/bp-xxx/message/sse',
  botProviderEndpoint: 'https://api.example.com/ns/xxx/bot-provider/bp-xxx',
  apiKey: 'xxx',
});

// Or in React:
<Chatbot
  config={{
    endpoint: 'https://api.example.com/ns/xxx/bot-provider/bp-xxx/message/sse',
    botProviderEndpoint: 'https://api.example.com/ns/xxx/bot-provider/bp-xxx',
    apiKey: 'xxx',
  }}
/>;
```

#### After (Recommended)

```typescript
const client = new AsgardServiceClient({
  botProviderEndpoint: 'https://api.example.com/ns/xxx/bot-provider/bp-xxx',
  apiKey: 'xxx',
  // endpoint is automatically derived as botProviderEndpoint + '/message/sse'
});

// Or in React:
<Chatbot
  config={{
    botProviderEndpoint: 'https://api.example.com/ns/xxx/bot-provider/bp-xxx',
    apiKey: 'xxx',
  }}
/>;
```

#### Transition Period

During the transition period, both approaches will work:

- If only `botProviderEndpoint` is provided: The SSE endpoint will be automatically derived
- If only `endpoint` is provided: It will work but show a deprecation warning
- If both are provided: The `endpoint` will be used with a deprecation warning

## Benefits

1. **Single Source of Truth**: Only one endpoint configuration needed
2. **Reduced Configuration Complexity**: Fewer chances for configuration errors
3. **Consistent API Design**: Aligns with REST API best practices
4. **Backward Compatibility**: Existing code continues to work during transition
5. **Clear Migration Path**: Helpful deprecation warnings guide users

## Timeline

- **v0.x.x** (Current): Add deprecation notices and new functionality
- **v0.x.x + 3 months**: Show deprecation warnings in console
- **v1.0.0**: Remove deprecated `endpoint` option entirely

## Testing Strategy

1. **Unit Tests**: Add tests for both configuration options
2. **Integration Tests**: Ensure backward compatibility
3. **Demo Apps**: Update to use new configuration
4. **Documentation**: Update all examples and guides

## Rollback Plan

If issues arise:

1. The change is backward compatible, so no immediate rollback needed
2. Can extend deprecation timeline if needed
3. Can provide migration tools if complex use cases are discovered
