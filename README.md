# 🔍 Searcho AI

**Your Intelligent Multi-Agent Research Assistant**

Searcho AI is a powerful React web application that leverages a team of **5 specialized AI agents** to research, analyze, and vote on the best answers to your questions. It goes beyond simple search results by synthesizing information from multiple sources and providing a consensus-based answer.

## ✨ Features

*   **Multi-Agent Architecture**: Orchestrates 5 distinct AI agents to tackle complex queries.
*   **Consensus Voting**: Agents vote on the most accurate and comprehensive answer.
*   **Real-time Research**: Scrapes and analyzes live web data for up-to-date information.
*   **Transparent Process**: Watch the agents think, search, and decide in real-time.
*   **Modern UI**: Built with React and Vite for a fast, responsive experience.

## 🚀 Quick Start

Get up and running in minutes!

### Prerequisites

*   Node.js (v18+)
*   npm

### Installation

1.  **Clone the repo**
    ```bash
    git clone https://github.com/UnlimitedBytes/searcho.git
    cd searcho
    ```

2.  **Setup Environment**
    Navigate to the server directory and set up your API key.
    ```bash
    cd server
    cp .env.example .env
    # Edit .env and add your OPENROUTER_API_KEY
    ```

3.  **Install & Run**
    From the root directory:
    ```bash
    npm run setup   # Installs dependencies for client and server
    npm start       # Builds client and starts the production server
    ```
    Visit `http://localhost:3001` to start searching!

## 🛠️ Development

Want to contribute or modify the code? Run the client and server separately for hot-reloading.

1.  **Start the Server**
    ```bash
    cd server
    npm run dev
    ```

2.  **Start the Client** (in a new terminal)
    ```bash
    cd client
    npm run dev
    ```

## 🏗️ Tech Stack

*   **Frontend**: React, Vite, Tailwind CSS (implied by index.css)
*   **Backend**: Node.js, Express
*   **AI/LLM**: OpenRouter (access to GPT-4, Claude, etc.)
*   **Tools**: Playwright/Puppeteer (for web scraping), Cheerio

## 📄 License

MIT


2.  **Start the Client**:
    Open a second terminal and run:
    ```bash
    cd client
    npm run dev
    ```
    The client will start on http://localhost:3000. It is configured to proxy API requests to the server on port 3001.

## Features

*   **5 AI Agents**: Each agent independently generates a response.
*   **Web Search**: Agents can choose to search the web using DuckDuckGo.
*   **Voting System**: Agents vote on the best response.
*   **Logging**: Detailed logs are saved to `server/logs/app.log` and displayed in the server console.

## Project Structure

*   `client/`: React frontend (Vite).
*   `server/`: Node.js/Express backend.
*   `prompts/`: System prompts used by the AI agents.
