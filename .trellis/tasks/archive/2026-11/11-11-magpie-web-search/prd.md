# Magpie web search

## Requirements

Connect local original creation to the user-provided Magpie MCP Streamable HTTP service. Administrators configure the gateway API key in advanced configuration. Both original entry points use the service when their existing search switch is enabled, with either Chat Completions or Responses text generation.

## Acceptance

- Advanced configuration saves and clears the key without returning it to clients; subsequent jobs observe saved changes.
- Search initializes MCP then calls `web_search` with query and count 5 at the supplied endpoint using Bearer authentication.
- Search text is supplied to text generation as untrusted reference material; disabled search makes no MCP call.
- Missing configuration, transport errors, tool errors and empty responses fail explicitly without falling back to model-native search.
- Deterministic protocol, configuration and integration checks plus the full project baseline pass.
- Local activation follows the clean committed HEAD rule. A commit needs explicit user authorization before activation; real search acceptance requires a configured key.
