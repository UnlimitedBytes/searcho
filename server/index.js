require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const Agent = require('./agent');
const logger = require('./logger');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Serve static files from the React app
app.use(express.static(path.join(__dirname, '../client/dist')));

const clients = new Map();

app.get('/api/events', (req, res) => {
  const { requestId } = req.query;
  if (!requestId) return res.status(400).end();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  clients.set(requestId, res);

  req.on('close', () => {
    clients.delete(requestId);
  });
});

app.post('/api/query', async (req, res) => {
  const { query, requestId } = req.body;
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!query) {
    return res.status(400).json({ error: 'Query is required' });
  }
  if (!apiKey) {
    return res.status(500).json({ error: 'OpenRouter API Key not configured on server' });
  }
  // EXA_API_KEY is not required when using the hosted MCP endpoint


  logger.info(`Received new query: "${query}"`);

  const sendUpdate = (agentId, status) => {
    const client = clients.get(requestId);
    if (client) {
      client.write(`data: ${JSON.stringify({ agentId, status })}\n\n`);
    }
  };

  try {
    // 1. Initialize 5 Agents
    const agents = Array.from({ length: 5 }, (_, i) => new Agent(i + 1, apiKey));

    // 2. Generate Responses (Parallel)
    logger.info('Starting 5 agents to generate responses...');
    const responsePromises = agents.map(agent => agent.generateResponse(query, sendUpdate));
    const agentResults = await Promise.all(responsePromises);

    const responses = agentResults.map(r => r.content);
    const allStats = agentResults.map(r => r.stats);

    logger.info('All agents have generated responses.');
    responses.forEach((r, i) => logger.info(`Response ${i + 1}: ${r.substring(0, 50)}...`));

    // 3. Voting Phase
    logger.info('Starting voting phase...');
    const votePromises = agents.map(agent => agent.vote(query, responses, sendUpdate));
    const votes = await Promise.all(votePromises);

    // 4. Tally Votes
    const voteCounts = new Array(responses.length).fill(0);
    votes.forEach(vote => {
      // Adjust for 0-based index (vote is 1-based)
      const index = (vote >= 1 && vote <= responses.length) ? vote - 1 : 0;
      voteCounts[index]++;
    });

    logger.info(`Vote results: ${JSON.stringify(voteCounts)}`);

    // 5. Determine Winner
    let maxVotes = -1;
    let winnerIndex = 0;
    for (let i = 0; i < voteCounts.length; i++) {
      if (voteCounts[i] > maxVotes) {
        maxVotes = voteCounts[i];
        winnerIndex = i;
      }
    }

    const bestResponse = responses[winnerIndex];
    logger.info(`Winner is Option ${winnerIndex + 1} with ${maxVotes} votes.`);

    res.json({
      query,
      bestResponse,
      allResponses: responses,
      allStats,
      votes: voteCounts,
      winnerIndex: winnerIndex + 1
    });

  } catch (error) {
    logger.error(`Orchestration error: ${error.message}`);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// The "catchall" handler: for any request that doesn't
// match one above, send back React's index.html file.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

app.listen(PORT, () => {
  logger.info(`Server running on http://localhost:${PORT}`);
});
