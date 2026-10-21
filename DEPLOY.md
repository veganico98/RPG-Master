# Deploy em produção

Este guia sobe o RPG Master em um servidor próprio com Docker. Em produção roda um único container: o backend Express serve a API (`/api/*`) e o build estático do frontend, na porta `3001`.

**Situação atual:** publicado em **https://32-192-117-236.sslip.io**, numa EC2 da conta AWS Academy (`us-east-1`), com [deploy/aws-ec2.sh](deploy/aws-ec2.sh). As seções 1 a 7 valem para qualquer servidor com Docker.

## AWS EC2 com um comando

[deploy/aws-ec2.sh](deploy/aws-ec2.sh) faz tudo nesta página numa EC2: cria chave SSH, grupo de segurança (SSH só do seu IP; 80 e 443 abertos), instância `t3.small` com Amazon Linux 2023 e Docker, e um Elastic IP. Depois envia o código, faz o build de `Dockerfile.prod` na própria instância e sobe o app atrás do Caddy, com HTTPS automático em `https://<ip-com-hifens>.sslip.io`.

```bash
# Git Bash, na raiz do repositório, com credenciais AWS no ambiente ou em ~/.aws/credentials
bash deploy/aws-ec2.sh
```

- Lê `OPENAI_API_KEY` e `N8N_WEBHOOK_URL` do `.env` local e os envia por SSH (stdin) para `/opt/rpggg/.env`; o `SESSION_SECRET` é gerado no servidor uma vez e preservado.
- Rodar de novo atualiza o código, reaproveitando instância, IP e segredo.
- A chave SSH fica em `~/.ssh/rpggg-key.pem`. Logs: `ssh -i ~/.ssh/rpggg-key.pem ec2-user@<ip> 'sudo docker logs rpggg-app'`.
- **AWS Academy (Learner Lab):** as credenciais mudam a cada sessão e as instâncias param quando a sessão acaba. O site volta sozinho no mesmo endereço quando o lab é iniciado de novo (Elastic IP + `--restart unless-stopped`).

### O que o script cria

| Recurso | Nome | Observação |
| --- | --- | --- |
| Instância EC2 | tag `Name=rpggg` | `t3.small`, Amazon Linux 2023, disco gp3 de 20 GB, swap de 2 GB |
| Elastic IP | tag `Name=rpggg` | Mantém o mesmo endereço (e o mesmo domínio sslip.io) entre reinícios |
| Grupo de segurança | `rpggg-sg` | 80 e 443 abertos; 22 só para os IPs de quem já rodou o script |
| Par de chaves | `rpggg-key` | Arquivo local em `~/.ssh/rpggg-key.pem` |
| Containers | `rpggg-app`, `rpggg-caddy` | Rede Docker `rpggg`; segredos em `/opt/rpggg/.env` (permissão 600) |

### Atualizar o site depois de mudar o código

1. No AWS Academy, inicie o lab (**Start Lab**) e abra **AWS Details → AWS CLI**.
2. Copie o bloco `[default]` para `~/.aws/credentials` (ou exporte `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` e `AWS_SESSION_TOKEN`).
3. No Git Bash, na raiz do projeto: `bash deploy/aws-ec2.sh`. Leva uns 5 minutos.
4. Quem estiver com o jogo ou a página de votação aberta precisa recarregar.

### Desligar tudo (parar de gastar créditos)

```bash
export AWS_DEFAULT_REGION=us-east-1
IID=$(aws ec2 describe-instances --filters Name=tag:Name,Values=rpggg Name=instance-state-name,Values=pending,running,stopping,stopped --query 'Reservations[0].Instances[0].InstanceId' --output text)
ALLOC=$(aws ec2 describe-addresses --filters Name=tag:Name,Values=rpggg --query 'Addresses[0].AllocationId' --output text)
aws ec2 terminate-instances --instance-ids "$IID" && aws ec2 wait instance-terminated --instance-ids "$IID"
aws ec2 release-address --allocation-id "$ALLOC"
aws ec2 delete-security-group --group-name rpggg-sg
aws ec2 delete-key-pair --key-name rpggg-key && rm -f ~/.ssh/rpggg-key.pem
```

Isso apaga a instância e o IP. Um novo `bash deploy/aws-ec2.sh` recria tudo, mas com outro endereço.

### Problemas do Git Bash no Windows (já tratados no script)

| Sintoma | Causa | Tratamento |
| --- | --- | --- |
| `Unable to load paramfile file:///tmp/...` | O `aws.exe` não enxerga caminhos `/tmp` do Git Bash | user-data passado como texto |
| `Invalid device name C:/Program Files/Git/dev/xvda` | O Git Bash converte `/dev/xvda` em caminho do Windows | `MSYS_NO_PATHCONV=1` |
| `Load key ... error in libcrypto` no SSH | O `aws.exe` grava a chave com CRLF | `tr -d '\r'` ao salvar a chave |

## 1. Pré-requisitos

- Docker e Docker Compose no servidor.
- Um domínio apontando para o servidor e um proxy reverso com HTTPS (Caddy, nginx ou o do provedor).
- Chave da OpenAI com acesso a chat, imagens e áudio, e com limite de gastos definido no painel da OpenAI.
- Opcional: webhook do n8n para o envio do resumo por e-mail.

## 2. Variáveis de ambiente

Copie [.env.example](.env.example) para `.env` na raiz e preencha.

| Variável | Obrigatória | Observação |
| --- | --- | --- |
| `OPENAI_API_KEY` | Sim | Só o backend lê; nunca vai para a imagem |
| `N8N_WEBHOOK_URL` | Não | Sem ela, o formulário de e-mail some da tela final e a rota de e-mail responde 500 |
| `SESSION_SECRET` | Sim | Assina o estado das partidas. Trocar invalida as partidas em andamento |
| `TRUST_PROXY` | Atrás de proxy | Número de proxies na frente do app (normalmente `1`). Sem isso, todos os jogadores parecem ter o IP do proxy e dividem o mesmo limite |
| `OPENAI_MODEL`, `OPENAI_IMAGE_MODEL`, `OPENAI_IMAGE_QUALITY`, `OPENAI_TTS_MODEL` | Não | Ver [README](README.md#9-configuração) |

O `.dockerignore` bloqueia `.env*`, então os segredos entram só em runtime via `env_file`.

## 3. Build e execução

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

[Dockerfile.prod](Dockerfile.prod) faz um build multi-stage: instala dependências, gera `dist/` com o Vite e copia para a imagem final só o necessário para o backend (que roda via `tsx`). A política `restart: unless-stopped` reinicia o container se ele cair.

Para atualizar depois de mudar o código:

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

Depois de mudar só o `.env`:

```bash
docker compose -f docker-compose.prod.yml up -d --force-recreate
```

## 4. HTTPS e proxy reverso

O container expõe HTTP na porta `3001`. Coloque um proxy reverso na frente para HTTPS. Exemplo com Caddy (certificado automático):

```
rpg-master.seudominio.com {
  reverse_proxy localhost:3001
}
```

Com proxy reverso, defina `TRUST_PROXY=1` e, de preferência, não publique a porta `3001` para a internet (troque `"3001:3001"` por `"127.0.0.1:3001:3001"` no [docker-compose.prod.yml](docker-compose.prod.yml)).

## 5. Proteções já embutidas

| Proteção | Onde |
| --- | --- |
| Estado da partida assinado (HMAC); o cliente não consegue alterar vida, ouro, inventário nem o turno | [backend/src/session.ts](backend/src/session.ts) |
| Limite por IP: 30 jogadas, 30 imagens e 60 narrações a cada 10 min; 5 e-mails por hora | [backend/src/server.ts](backend/src/server.ts) |
| E-mail só para partida terminada, uma vez por partida | `/api/game/send-summary` |
| Guardrails numéricos (ouro, vida, nível) aplicados no servidor | `normalize` em [ai/gameMaster.ts](ai/gameMaster.ts) |
| Modo plateia: só o telão (com a `hostKey` da sala) controla as rodadas; até 200 salas e 2.000 votantes por sala; limites de 20 salas por hora e 6.000 votos a cada 10 min por IP | [backend/src/rooms.ts](backend/src/rooms.ts), [backend/src/roomRoutes.ts](backend/src/roomRoutes.ts) |

Os limites e as salas da plateia ficam em memória: valem para um único container e somem num restart. Para várias instâncias, troque por um armazenamento compartilhado (Redis, por exemplo).

## 6. Operação

- **Health check:** `GET /api/health` deve retornar `{"ok":true,"hasKey":true,"hasEmail":...}` (`hasEmail` é `true` só com o n8n configurado).
- **Logs:** `docker compose -f docker-compose.prod.yml logs -f`; na AWS, `ssh -i ~/.ssh/rpggg-key.pem ec2-user@<ip> 'sudo docker logs -f rpggg-app'`. Erros do provedor aparecem com o prefixo `[backend]`.
- **Rotação da chave da OpenAI:** gere uma nova no painel, troque no `.env`, rode `up -d --force-recreate` e revogue a antiga.
- **Rotação do `SESSION_SECRET`:** derruba as partidas em andamento (os jogadores precisam começar de novo). Faça fora de horário de pico.
- **Custos:** acompanhe o uso no painel da OpenAI. Cada turno pode gerar até três chamadas pagas (texto, imagem e, se o jogador escolher uma voz da OpenAI, áudio).

## 7. Antes de abrir ao público

- [ ] Definir limite de gastos mensal na OpenAI.
- [ ] Confirmar o fluxo do n8n e o aviso de privacidade do formulário de e-mail (LGPD).
- [ ] Testar uma partida completa no ambiente de produção (e o e-mail, se o n8n estiver configurado).
- [ ] Ensaiar o modo plateia com alguns celulares reais na rede do local da apresentação.
- [ ] Confirmar que a sessão do AWS Academy estará ativa durante toda a apresentação.
