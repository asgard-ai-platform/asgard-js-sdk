# Asgard JS SDK

SDK for integrating AI chatbots with the [Asgard AI](https://asgard-ai.com) platform.

## Table of Contents

- [Features](#features)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Choose Your Package](#choose-your-package)
- [React Package (@asgard-js/react)](./packages/react/README.md)
  - [Installation](./packages/react/README.md#installation)
  - [Usage](./packages/react/README.md#usage)
    - [Basic Usage](./packages/react/README.md#basic-usage)
    - [File Upload Support](./packages/react/README.md#file-upload-support)
    - [Conversation Export](./packages/react/README.md#conversation-export)
    - [API Key Authentication](./packages/react/README.md#api-key-authentication)
  - [Migration Guide](./packages/react/README.md#migration-from-endpoint-to-botproviderendpoint)
  - [API Reference](./packages/react/README.md#api-reference)
    - [Chatbot Component Props](./packages/react/README.md#chatbot-component-props)
    - [Theme Configuration](./packages/react/README.md#theme-configuration)
  - [Event Handlers](./packages/react/README.md#event-handlers)
    - [Tool Call Handler](./packages/react/README.md#tool-call-handler)
    - [Tool Call Consent](./packages/react/README.md#tool-call-consent)
    - [EMIT Action](./packages/react/README.md#emit-action)
  - [Custom Header](./packages/react/README.md#custom-header)
  - [Development](./packages/react/README.md#development)
- [Core Package (@asgard-js/core)](./packages/core/README.md)
  - [Installation](./packages/core/README.md#installation)
  - [Usage](./packages/core/README.md#usage)
  - [Migration Guide](./packages/core/README.md#migration-from-endpoint-to-botproviderendpoint)
  - [API Reference](./packages/core/README.md#api-reference)
    - [AsgardServiceClient](./packages/core/README.md#asgardserviceclient)
    - [Channel](./packages/core/README.md#channel)
    - [Conversation](./packages/core/README.md#conversation)
    - [File Upload API](./packages/core/README.md#file-upload-api)
    - [Authentication Types](./packages/core/README.md#authentication-types)
  - [Development](./packages/core/README.md#development)
- [Links](#links)

## Features

- **Real-time Streaming** - SSE (Server-Sent Events) for instant message delivery
- **Rich Message Templates** - Text, images, carousels, buttons, charts, and more
- **Customizable Themes** - Full control over chatbot appearance
- **File Upload** - Drag & drop image uploads with preview
- **Voice Input** - Browser speech recognition integration
- **Conversation Export** - Download chat history as Markdown
- **Tool Call Consent** - Built-in approval modal for user-controlled tool execution

## Getting Started

### Prerequisites

- Node.js 18+

### Choose Your Package

- **React** → [@asgard-js/react](./packages/react/README.md)
- **Other frameworks (Vue, vanilla JS, etc.)** → [@asgard-js/core](./packages/core/README.md)

## Links

- [Developer Documentation](https://docs.asgard-ai.com/docs/developer-reference/welcome)
- [GitHub Repository](https://github.com/asgard-ai-platform/asgard-js-sdk)
- [@asgard-js/core on npm](https://www.npmjs.com/package/@asgard-js/core)
- [@asgard-js/react on npm](https://www.npmjs.com/package/@asgard-js/react)
- [Asgard AI](https://asgard-ai.com)
