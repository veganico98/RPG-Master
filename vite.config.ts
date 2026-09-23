import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react(), tailwindcss(), openaiResponsesProxy(env.OPENAI_API_KEY)],
    resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  }
})

/** Mantém a chave da OpenAI no .env durante o desenvolvimento. */
function openaiResponsesProxy(apiKey: string | undefined): Plugin {
  return {
    name: 'openai-responses-proxy',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/openai/responses', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.setHeader('Allow', 'POST')
          res.end('Method Not Allowed')
          return
        }

        if (!apiKey) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: { message: 'OPENAI_API_KEY não foi configurada no .env.' } }))
          return
        }

        try {
          const chunks: Buffer[] = []
          for await (const chunk of req) chunks.push(Buffer.from(chunk))
          const response = await fetch('https://api.openai.com/v1/responses', {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: Buffer.concat(chunks).toString('utf8'),
          })

          res.statusCode = response.status
          res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json')
          res.end(await response.text())
        } catch {
          res.statusCode = 502
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: { message: 'Não foi possível conectar à API da OpenAI.' } }))
        }
      })
    },
  }
}
