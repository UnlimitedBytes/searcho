const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const { searchWeb, searchCode } = require('./tools/search');
const { fetchPage, validateLink } = require('./tools/fetch');
const { calculate } = require('./tools/calculator');
const { runScript } = require('./tools/sandbox');
const logger = require('./logger');

function loadPrompt(filename, data = {}) {
  try {
    const filePath = path.join(__dirname, '../prompts', filename);
    let content = fs.readFileSync(filePath, 'utf-8');
    for (const [key, value] of Object.entries(data)) {
      content = content.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }
    return content;
  } catch (error) {
    console.error(`Error loading prompt ${filename}:`, error);
    throw error;
  }
}

const tools = [
  {
    type: "function",
    function: {
      name: "searchWeb",
      description: "Search the web for information.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query."
          }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "searchCode",
      description: "Search for code snippets, repositories, and programming documentation.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The code search query."
          }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "fetchPage",
      description: "Fetch the content of a web page.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "The URL of the page to fetch."
          },
          format: {
            type: "string",
            enum: ["html", "markdown", "text"],
            description: "The format of the content to return. Defaults to 'markdown'."
          }
        },
        required: ["url"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "calculate",
      description: "Evaluate a mathematical expression. Supports arithmetic, functions, and unit conversions.",
      parameters: {
        type: "object",
        properties: {
          expression: {
            type: "string",
            description: "The mathematical expression to evaluate (e.g., '2 + 2', 'sin(45 deg)', '12.7 cm to inch')."
          }
        },
        required: ["expression"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "runScript",
      description: "Run JavaScript code in a secure sandbox. Use this for complex logic, data processing, or solving algorithmic problems. The environment has no access to the file system or network. 'console.log' is available.",
      parameters: {
        type: "object",
        properties: {
          code: {
            type: "string",
            description: "The JavaScript code to execute."
          }
        },
        required: ["code"]
      }
    }
  }
];

class Agent {
  constructor(id, apiKey, contextWindowSize = 128000) {
    this.id = id;
    this.client = new OpenAI({
      apiKey: apiKey,
      baseURL: "https://openrouter.ai/api/v1"
    });
    this.model = process.env.OPENROUTER_MODEL || "openrouter/sherlock-think-alpha";
    this.contextWindowSize = contextWindowSize;
  }

  async summarizeHistory(messages) {
    const summaryPrompt = loadPrompt('summarize_system.md');
    // Convert messages to a string for the summarizer, skipping the initial system prompt if desired,
    // but keeping it simple: just dump everything.
    // We might want to skip the very first system prompt to avoid summarizing instructions.
    const conversation = messages.slice(1).map(m => {
        const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
        return `${m.role}: ${content}`;
    }).join('\n\n');

    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: summaryPrompt },
        { role: "user", content: "Summarize this conversation:\n\n" + conversation }
      ]
    });

    return completion.choices[0].message.content;
  }

  async generateResponse(userQuery, onStatusUpdate) {
    const startTime = Date.now();
    let apiTime = 0;
    let inputTokens = 0;
    let outputTokens = 0;

    const updateStatus = (status) => {
      if (onStatusUpdate) onStatusUpdate(this.id, status);
    };

    updateStatus("Thinking...");
    logger.info(`Agent ${this.id} starting task for query: "${userQuery}"`);

    const currentDate = new Date().toLocaleString();
    const systemPrompt = loadPrompt('agent_system.md', {
      agentId: this.id,
      currentDate: currentDate
    });

    let messages = [
      {
        role: "system",
        content: systemPrompt
      },
      { role: "user", content: userQuery }
    ];

    let turns = 0;
    const maxTurns = 10;

    try {
      while (turns < maxTurns) {
        turns++;

        // Call LLM
        const apiStart = Date.now();
        const completion = await this.client.chat.completions.create({
          model: this.model,
          messages: messages,
          tools: tools
        });
        apiTime += (Date.now() - apiStart);

        const responseMessage = completion.choices[0].message;
        const responseContent = responseMessage.content;
        const usage = completion.usage;

        if (usage) {
            inputTokens += usage.prompt_tokens || 0;
            outputTokens += usage.completion_tokens || 0;
        }

        // Add the assistant's response to the conversation history
        messages.push(responseMessage);

        logger.info(`Agent ${this.id} turn ${turns} response: ${responseContent ? responseContent.substring(0, 100) : 'Tool Call'}...`);

        // Check for tool calls
        if (responseMessage.tool_calls) {
            for (const toolCall of responseMessage.tool_calls) {
                const functionName = toolCall.function.name;
                const functionArgs = JSON.parse(toolCall.function.arguments);
                let toolResult;

                if (functionName === 'searchWeb') {
                    updateStatus(`Searching: ${functionArgs.query}`);
                    logger.info(`Agent ${this.id} requested search: ${functionArgs.query}`);
                    toolResult = await searchWeb(functionArgs.query);
                } else if (functionName === 'searchCode') {
                    updateStatus(`Searching Code: ${functionArgs.query}`);
                    logger.info(`Agent ${this.id} requested code search: ${functionArgs.query}`);
                    toolResult = await searchCode(functionArgs.query);
                } else if (functionName === 'fetchPage') {
                    updateStatus(`Fetching: ${functionArgs.url}`);
                    logger.info(`Agent ${this.id} requested fetch: ${functionArgs.url}`);
                    try {
                        toolResult = await fetchPage(functionArgs.url, functionArgs.format || 'markdown');
                        toolResult = toolResult.substring(0, 5000) + (toolResult.length > 5000 ? "... (truncated)" : "");
                    } catch (err) {
                        toolResult = `Failed to fetch page (${functionArgs.url}): ${err.message}`;
                    }
                } else if (functionName === 'calculate') {
                    updateStatus(`Calculating: ${functionArgs.expression}`);
                    logger.info(`Agent ${this.id} requested calculation: ${functionArgs.expression}`);
                    toolResult = await calculate(functionArgs.expression);
                } else if (functionName === 'runScript') {
                    updateStatus(`Running script...`);
                    logger.info(`Agent ${this.id} requested script execution`);
                    toolResult = await runScript(functionArgs.code);
                } else {
                    toolResult = `Unknown tool: ${functionName}`;
                }

                messages.push({
                    role: "tool",
                    tool_call_id: toolCall.id,
                    name: functionName,
                    content: toolResult
                });
            }

            // Check context usage after tool calls (using the usage from the *previous* completion as a baseline,
            // but we know we just added more content).
            // Since we don't have the exact usage after tool outputs, we rely on the usage from the completion
            // plus a heuristic or just wait for the next turn's usage.
            // However, the user asked to summarize if > 80%.
            // If the *last* completion was already > 80%, we definitely need to summarize now before sending tool outputs back?
            // Actually, if we send tool outputs back, we are sending the *entire* history again.
            // So if usage > 80%, we should summarize *before* the next loop iteration.

            if (usage && usage.total_tokens > this.contextWindowSize * 0.8) {
                updateStatus("Context limit reached. Summarizing...");
                logger.info(`Agent ${this.id} context usage ${usage.total_tokens} > 80% of ${this.contextWindowSize}. Summarizing...`);

                const summary = await this.summarizeHistory(messages);

                // Reset messages with summary
                messages = [
                    { role: "system", content: systemPrompt },
                    { role: "system", content: `Previous conversation summary: ${summary}` },
                    // We need to ensure the model knows to continue the current flow.
                    // If we just had tool calls, the model expects to see the tool outputs.
                    // If we summarize, we effectively "squash" the tool calls and outputs into the summary.
                    // This might be tricky if the model was expecting to process the tool outputs immediately.
                    // However, if we summarize "The agent searched for X and found Y", the model can then decide what to do next.
                    // So we should append a user message prompting to continue.
                    { role: "user", content: `Based on the summary, please continue with the task: ${userQuery}` }
                ];
            }

            updateStatus("Thinking...");
            continue; // Loop again with new context
        }        // If no tool call, it's a potential final response. Validate links.
        updateStatus("Validating sources...");
        const urlRegex = /(https?:\/\/[^\s)]+)/g;
        const links = [...new Set((responseContent || '').match(urlRegex) || [])]; // Unique links

        // Clean up links (remove trailing punctuation often caught by regex)
        const cleanLinks = links.map(link => link.replace(/[.,;>)]$/, ''));

        const failedLinks = [];
        for (const link of cleanLinks) {
          const isValid = await validateLink(link);
          if (!isValid) {
            failedLinks.push(link);
          }
        }

        if (failedLinks.length > 0) {
          logger.warn(`Agent ${this.id} provided invalid links: ${failedLinks.join(', ')}`);
          // responseMessage is already in messages.

          const errorPrompt = loadPrompt('link_validation_error.md', {
            failedLinks: failedLinks.join(', ')
          });

          messages.push({
            role: "system",
            content: errorPrompt
          });

          if (usage && usage.total_tokens > this.contextWindowSize * 0.8) {
            updateStatus("Context limit reached. Summarizing...");
            logger.info(`Agent ${this.id} context usage ${usage.total_tokens} > 80% of ${this.contextWindowSize}. Summarizing...`);

            const summary = await this.summarizeHistory(messages);

            messages = [
                { role: "system", content: systemPrompt },
                { role: "system", content: `Previous conversation summary: ${summary}` },
                { role: "user", content: `Please fix the invalid links and continue with the task: ${userQuery}` }
            ];
          }

          updateStatus("Fixing sources...");
          continue; // Loop again to fix
        }

        // All checks passed
        updateStatus("Response generated");

        // Cleanup response: Remove wrapping code blocks if present
        let finalResponse = (responseContent || '').trim();
        if (finalResponse.startsWith('```') && finalResponse.endsWith('```')) {
            const lines = finalResponse.split('\n');
            if (lines.length >= 2) {
                finalResponse = lines.slice(1, -1).join('\n').trim();
            }
        }

        return {
            content: finalResponse,
            stats: {
                rounds: turns,
                inputTokens,
                outputTokens,
                runtime: Date.now() - startTime,
                apiTime
            }
        };
      }

      return {
          content: "I apologize, but I was unable to generate a verified response within the limit.",
          stats: {
              rounds: turns,
              inputTokens,
              outputTokens,
              runtime: Date.now() - startTime,
              apiTime
          }
      };

    } catch (error) {
      updateStatus("Error");
      logger.error(`Agent ${this.id} error: ${error.message}`);
      return {
          content: "I encountered an error while processing your request.",
          stats: {
              rounds: turns,
              inputTokens,
              outputTokens,
              runtime: Date.now() - startTime,
              apiTime
          }
      };
    }
  }  async vote(prompt, responses, onStatusUpdate) {
    const updateStatus = (status) => {
      if (onStatusUpdate) onStatusUpdate(this.id, status);
    };

    updateStatus("Voting...");
    logger.info(`Agent ${this.id} is voting...`);

    const candidates = responses.map((r, i) => `Option ${i + 1}:\n${r}`).join('\n\n');
    const voteSystemPrompt = loadPrompt('vote_system.md');

    const voteMessages = [
      {
        role: "system",
        content: voteSystemPrompt
      },
      {
        role: "user",
        content: `Original Prompt: "${prompt}"\n\nCandidates:\n${candidates}`
      }
    ];

    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: voteMessages
      });

      const voteContent = completion.choices[0].message.content.trim();
      const vote = parseInt(voteContent.match(/\d+/)?.[0]);

      updateStatus(`Voted for Option ${isNaN(vote) ? 1 : vote}`);
      logger.info(`Agent ${this.id} voted for Option ${vote}`);
      return isNaN(vote) ? 1 : vote; // Default to 1 if parsing fails
    } catch (error) {
      updateStatus("Voting failed");
      logger.error(`Agent ${this.id} voting error: ${error.message}`);
      return 1; // Default vote
    }
  }
}

module.exports = Agent;
