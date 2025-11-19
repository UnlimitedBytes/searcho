const axios = require('axios');
const logger = require('../logger');

const MCP_URL = 'https://mcp.exa.ai/mcp';
const searchCache = new Map();

async function callMcpTool(toolName, args) {
  const cacheKey = `${toolName}:${JSON.stringify(args)}`;
  if (searchCache.has(cacheKey)) {
    logger.info(`Cache hit for tool call: ${toolName}`);
    return searchCache.get(cacheKey);
  }

  try {
    const response = await axios.post(MCP_URL, {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: toolName,
        arguments: args
      }
    }, {
      headers: {
        'Accept': 'application/json, text/event-stream',
        'Content-Type': 'application/json'
      },
      timeout: 60000
    });

    // Parse SSE response
    // Expected format:
    // event: message
    // data: {"jsonrpc":"2.0","result":{...},"id":1}

    const data = response.data;
    let jsonResponse;

    if (typeof data === 'object') {
        // In case it returns JSON directly (not SSE)
        jsonResponse = data;
    } else {
        const lines = data.split('\n');
        for (const line of lines) {
            if (line.startsWith('data: ')) {
                try {
                    jsonResponse = JSON.parse(line.substring(6));
                    break;
                } catch (e) {
                    logger.warn('Failed to parse MCP data line:', line);
                }
            }
        }
    }

    if (!jsonResponse) {
        throw new Error('Invalid MCP response format');
    }

    if (jsonResponse.error) {
        throw new Error(jsonResponse.error.message || 'Unknown MCP error');
    }

    if (jsonResponse.result && jsonResponse.result.content) {
        // Combine all text content
        const result = jsonResponse.result.content
            .filter(c => c.type === 'text')
            .map(c => c.text)
            .join('\n\n');
        searchCache.set(cacheKey, result);
        return result;
    }

    const result = "No results found.";
    searchCache.set(cacheKey, result);
    return result;

  } catch (error) {
    logger.error(`MCP tool call failed: ${error.message}`);
    if (error.response) {
      logger.error(`MCP response data: ${JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
}

async function searchWeb(query) {
  logger.info(`Executing web search for: "${query}"`);
  try {
    return await callMcpTool('web_search_exa', { query });
  } catch (error) {
    return `Error occurred during search: ${error.message}`;
  }
}

async function searchCode(query) {
  logger.info(`Executing code search for: "${query}"`);
  try {
    return await callMcpTool('get_code_context_exa', { query });
  } catch (error) {
    return `Error occurred during search: ${error.message}`;
  }
}

module.exports = { searchWeb, searchCode };
