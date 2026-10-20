import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import VotePage from './VotePage'
import './index.css'

// /v ou /v/CODIGO → página de votação do celular (modo plateia); o resto é o jogo.
const voteMatch = window.location.pathname.match(/^\/v(?:\/([A-Za-z0-9]{5}))?\/?$/)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {voteMatch ? <VotePage initialCode={voteMatch[1]?.toUpperCase() ?? null} /> : <App />}
  </React.StrictMode>,
)
