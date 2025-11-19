import { useState } from 'react'
import axios from 'axios'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import './index.css'

const Pre = ({ children, ...props }) => {
  // If the child is a code block with a language, unwrap the pre tag
  // so we can render our custom block component without nesting it in a pre.
  if (children && children.props && children.props.className && children.props.className.includes('language-')) {
    return <>{children}</>
  }
  return <pre {...props}>{children}</pre>
}

const CodeBlock = ({ node, inline, className, children, ...props }) => {
  const [copied, setCopied] = useState(false)
  const match = /language-(\w+)/.exec(className || '')
  const language = match ? match[1] : 'text'

  if (match) {
    const codeString = String(children).replace(/\n$/, '')
    const handleCopy = () => {
      navigator.clipboard.writeText(codeString)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
    return (
      <div className="code-block">
        <div className="code-block-header">
          <span className="code-block-lang">{language.toUpperCase()}</span>
          <button
            type="button"
            aria-label="Copy code"
            onClick={handleCopy}
            className="code-block-copy"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <SyntaxHighlighter
          {...props}
          children={codeString}
          style={vscDarkPlus}
          language={language}
          PreTag="div"
          customStyle={{ margin: 0, borderRadius: 0 }}
        />
      </div>
    )
  }

  return <code className={className} {...props}>{children}</code>
}

function App() {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [agentStatuses, setAgentStatuses] = useState({})

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!query.trim()) return

    setLoading(true)
    setError(null)
    setResult(null)
    setAgentStatuses({})

    const requestId = Date.now().toString();
    const eventSource = new EventSource(`/api/events?requestId=${requestId}`);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setAgentStatuses(prev => ({
        ...prev,
        [data.agentId]: data.status
      }));
    };

    try {
      const response = await axios.post('/api/query', { query, requestId })
      setResult(response.data)
    } catch (err) {
      console.error(err)
      setError(err.response?.data?.error || 'An error occurred')
    } finally {
      setLoading(false)
      eventSource.close();
    }
  }

  return (
    <>
      <h1>Searcho AI</h1>
      <p>Ask a question. 5 Agents will research and vote on the best answer.</p>

      <form onSubmit={handleSubmit}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="What do you want to know?"
          disabled={loading}
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Researching...' : 'Ask Agents'}
        </button>
      </form>

      {error && <div style={{color: 'red', marginTop: '20px'}}>{error}</div>}

      {loading && (
        <div className="loading">
          <p>Agents are researching and voting...</p>
          <div style={{display: 'flex', justifyContent: 'center', gap: '10px', marginTop: '20px', flexWrap: 'wrap'}}>
            {[1, 2, 3, 4, 5].map(id => (
              <div key={id} style={{
                border: '1px solid #555',
                padding: '10px',
                borderRadius: '8px',
                width: '150px',
                background: '#333'
              }}>
                <strong>Agent {id}</strong>
                <div style={{fontSize: '0.8em', marginTop: '5px', color: '#aaa'}}>
                  {agentStatuses[id] || 'Waiting...'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {result && (
        <div className="card">
          <h2>Best Answer (Winner: Option {result.winnerIndex})</h2>
                    <div className="response-text">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{ pre: Pre, code: CodeBlock }}
            >
              {result.bestResponse}
            </ReactMarkdown>
          </div>          <details style={{marginTop: '20px', cursor: 'pointer'}}>
            <summary style={{padding: '10px', background: '#444', borderRadius: '5px'}}>View All Candidate Responses & Votes</summary>

            <div style={{marginTop: '15px'}}>
              {result.allResponses.map((resp, idx) => (
                <div key={idx} style={{
                  border: idx + 1 === result.winnerIndex ? '1px solid #646cff' : '1px solid #555',
                  marginTop: '15px',
                  padding: '15px',
                  borderRadius: '8px',
                  background: idx + 1 === result.winnerIndex ? 'rgba(100, 108, 255, 0.1)' : 'transparent'
                }}>
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px'}}>
                    <strong style={{color: idx + 1 === result.winnerIndex ? '#646cff' : 'inherit'}}>
                      Option {idx + 1} {idx + 1 === result.winnerIndex ? '🏆' : ''}
                    </strong>
                    <span style={{background: '#222', padding: '4px 10px', borderRadius: '12px', fontSize: '0.9em'}}>
                      {result.votes[idx]} Votes
                    </span>
                  </div>
                  <div className="response-text" style={{fontSize: '0.95em', opacity: 0.9}}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ pre: Pre, code: CodeBlock }}>{resp}</ReactMarkdown>
                  </div>
                </div>
              ))}
            </div>
          </details>
        </div>
      )}
    </>
  )
}

export default App
