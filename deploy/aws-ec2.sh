#!/usr/bin/env bash
# Deploy do RPG numa instância EC2 (Amazon Linux 2023 + Docker), com HTTPS
# automático via Caddy num domínio gratuito <ip>.sslip.io.
#
# Uso (da raiz do repositório, com credenciais AWS no ambiente ou no profile):
#   bash deploy/aws-ec2.sh
#
# Rodar de novo atualiza o código: reaproveita a instância, o IP e o
# SESSION_SECRET já existentes. Lê OPENAI_API_KEY e N8N_WEBHOOK_URL do .env
# da raiz; nenhum segredo vai para a imagem nem para a linha de comando remota.
set -euo pipefail

REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-us-east-1}}"
NAME="${NAME:-rpggg}"
INSTANCE_TYPE="${INSTANCE_TYPE:-t3.small}"
KEY_FILE="${KEY_FILE:-$HOME/.ssh/$NAME-key.pem}"
ENV_FILE="${ENV_FILE:-.env}"
export AWS_DEFAULT_REGION="$REGION" AWS_PAGER=""
# Git Bash no Windows converte argumentos como /dev/xvda em caminhos C:/...
# ao chamar o aws.exe; aqui todo caminho com / é da AWS ou da instância.
export MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'

log() { printf '\n==> %s\n' "$*"; }
die() { printf 'ERRO: %s\n' "$*" >&2; exit 1; }

[[ -f Dockerfile.prod ]] || die "rode da raiz do repositório"
[[ -f "$ENV_FILE" ]] || die "$ENV_FILE não encontrado"
env_value() { tr -d '\r' <"$ENV_FILE" | grep -E "^$1=" | tail -1 | cut -d= -f2- || true; }
OPENAI_API_KEY="$(env_value OPENAI_API_KEY)"
N8N_WEBHOOK_URL="$(env_value N8N_WEBHOOK_URL)"
[[ -n "$OPENAI_API_KEY" ]] || die "OPENAI_API_KEY vazio em $ENV_FILE"

log "Conta AWS"
aws sts get-caller-identity --query Arn --output text

# ── Chave SSH ──────────────────────────────────────────────────────────
if ! aws ec2 describe-key-pairs --key-names "$NAME-key" >/dev/null 2>&1; then
  log "Criando par de chaves $NAME-key em $KEY_FILE"
  mkdir -p "$(dirname "$KEY_FILE")"
  # tr: no Windows o aws.exe grava CRLF, e o ssh recusa a chave ("error in libcrypto").
  # Grava num temporário: se o create-key-pair falhar, a chave existente não é truncada.
  aws ec2 create-key-pair --key-name "$NAME-key" --key-type ed25519 --query KeyMaterial --output text | tr -d '\r' >"$KEY_FILE.tmp"
  [[ -s "$KEY_FILE.tmp" ]] || { rm -f "$KEY_FILE.tmp"; die "create-key-pair não retornou a chave"; }
  mv "$KEY_FILE.tmp" "$KEY_FILE"
  chmod 600 "$KEY_FILE"
fi
[[ -s "$KEY_FILE" ]] || die "o par $NAME-key existe na AWS, mas $KEY_FILE não está nesta máquina (ou está vazio)"

# ── Grupo de segurança: SSH só deste IP; HTTP/HTTPS abertos ────────────
MY_IP="$(curl -fsS https://checkip.amazonaws.com | tr -d '[:space:]')"
VPC_ID="$(aws ec2 describe-vpcs --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId' --output text)"
SG_ID="$(aws ec2 describe-security-groups --filters Name=group-name,Values="$NAME-sg" Name=vpc-id,Values="$VPC_ID" \
  --query 'SecurityGroups[0].GroupId' --output text)"
if [[ "$SG_ID" == "None" ]]; then
  log "Criando grupo de segurança $NAME-sg"
  SG_ID="$(aws ec2 create-security-group --group-name "$NAME-sg" --description "$NAME web + ssh" --vpc-id "$VPC_ID" \
    --query GroupId --output text)"
  aws ec2 authorize-security-group-ingress --group-id "$SG_ID" --ip-permissions \
    'IpProtocol=tcp,FromPort=80,ToPort=80,IpRanges=[{CidrIp=0.0.0.0/0}]' \
    'IpProtocol=tcp,FromPort=443,ToPort=443,IpRanges=[{CidrIp=0.0.0.0/0}]' >/dev/null
fi
aws ec2 authorize-security-group-ingress --group-id "$SG_ID" \
  --ip-permissions "IpProtocol=tcp,FromPort=22,ToPort=22,IpRanges=[{CidrIp=$MY_IP/32,Description=ssh-admin}]" \
  >/dev/null 2>&1 || true # já liberado

# ── Instância ──────────────────────────────────────────────────────────
INSTANCE_ID="$(aws ec2 describe-instances \
  --filters Name=tag:Name,Values="$NAME" Name=instance-state-name,Values=pending,running,stopping,stopped \
  --query 'Reservations[0].Instances[0].InstanceId' --output text)"
if [[ "$INSTANCE_ID" == "None" ]]; then
  log "Criando instância $INSTANCE_TYPE"
  AMI_ID="$(aws ec2 describe-images --owners amazon \
    --filters 'Name=name,Values=al2023-ami-2023.*-kernel-*-x86_64' Name=state,Values=available \
    --query 'sort_by(Images,&CreationDate)[-1].ImageId' --output text)"
  # Passado como texto (o CLI faz o base64): file:///tmp/... não funciona com o aws.exe no Git Bash.
  USER_DATA='#!/bin/bash
dnf install -y docker
systemctl enable --now docker
usermod -aG docker ec2-user
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo "/swapfile swap swap defaults 0 0" >> /etc/fstab'
  INSTANCE_ID="$(aws ec2 run-instances --image-id "$AMI_ID" --instance-type "$INSTANCE_TYPE" --key-name "$NAME-key" \
    --security-group-ids "$SG_ID" --user-data "$USER_DATA" \
    --block-device-mappings 'DeviceName=/dev/xvda,Ebs={VolumeSize=20,VolumeType=gp3}' \
    --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$NAME}]" \
    --query 'Instances[0].InstanceId' --output text)"
else
  aws ec2 start-instances --instance-ids "$INSTANCE_ID" >/dev/null 2>&1 || true
fi
log "Aguardando a instância $INSTANCE_ID"
aws ec2 wait instance-running --instance-ids "$INSTANCE_ID"

# ── IP fixo (Elastic IP), para o domínio não mudar entre reinícios ─────
ALLOC_ID="$(aws ec2 describe-addresses --filters Name=tag:Name,Values="$NAME" --query 'Addresses[0].AllocationId' --output text)"
if [[ "$ALLOC_ID" == "None" ]]; then
  ALLOC_ID="$(aws ec2 allocate-address --domain vpc \
    --tag-specifications "ResourceType=elastic-ip,Tags=[{Key=Name,Value=$NAME}]" --query AllocationId --output text)"
fi
aws ec2 associate-address --instance-id "$INSTANCE_ID" --allocation-id "$ALLOC_ID" >/dev/null
PUBLIC_IP="$(aws ec2 describe-addresses --allocation-ids "$ALLOC_ID" --query 'Addresses[0].PublicIp' --output text)"
DOMAIN="${DOMAIN:-${PUBLIC_IP//./-}.sslip.io}"
log "IP $PUBLIC_IP → https://$DOMAIN"

SSH=(ssh -i "$KEY_FILE" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 "ec2-user@$PUBLIC_IP")
log "Aguardando SSH e Docker na instância"
for _ in $(seq 1 40); do
  "${SSH[@]}" 'sudo cloud-init status --wait >/dev/null 2>&1; command -v docker' >/dev/null 2>&1 && break
  sleep 10
done
"${SSH[@]}" 'command -v docker >/dev/null' || die "Docker não ficou disponível na instância"

# ── Código ─────────────────────────────────────────────────────────────
log "Enviando o código"
tar czf - --exclude=node_modules --exclude=dist --exclude='.env' --exclude='.env.*' --exclude='*.pem' \
  --exclude=.git --exclude='*.log' . |
  "${SSH[@]}" 'sudo rm -rf /opt/rpggg/src && sudo mkdir -p /opt/rpggg/src && sudo tar xzf - -C /opt/rpggg/src'

# ── Segredos: via stdin; SESSION_SECRET é gerado uma vez e preservado ──
log "Atualizando o .env do servidor"
printf 'OPENAI_API_KEY=%s\nN8N_WEBHOOK_URL=%s\n' "$OPENAI_API_KEY" "$N8N_WEBHOOK_URL" |
  "${SSH[@]}" 'set -e
    sudo touch /opt/rpggg/.env && sudo chmod 600 /opt/rpggg/.env
    SECRET=$(sudo grep -E "^SESSION_SECRET=" /opt/rpggg/.env | cut -d= -f2- || true)
    [ -n "$SECRET" ] || SECRET=$(openssl rand -hex 32)
    { cat; echo "SESSION_SECRET=$SECRET"; echo "TRUST_PROXY=1"; } | sudo tee /opt/rpggg/.env.new >/dev/null
    sudo chmod 600 /opt/rpggg/.env.new && sudo mv /opt/rpggg/.env.new /opt/rpggg/.env'

# ── Build e containers (app + Caddy com HTTPS) ─────────────────────────
log "Build da imagem e subida dos containers (alguns minutos na primeira vez)"
"${SSH[@]}" "DOMAIN='$DOMAIN' bash -s" <<'EOF'
set -euo pipefail
cd /opt/rpggg/src
sudo docker build -f Dockerfile.prod -t rpggg:latest .
sudo docker network create rpggg >/dev/null 2>&1 || true

sudo docker rm -f rpggg-app >/dev/null 2>&1 || true
sudo docker run -d --name rpggg-app --network rpggg --restart unless-stopped \
  --env-file /opt/rpggg/.env rpggg:latest >/dev/null

printf '%s {\n  encode gzip\n  reverse_proxy rpggg-app:3001\n}\n' "$DOMAIN" | sudo tee /opt/rpggg/Caddyfile >/dev/null
sudo docker rm -f rpggg-caddy >/dev/null 2>&1 || true
sudo docker run -d --name rpggg-caddy --network rpggg --restart unless-stopped \
  -p 80:80 -p 443:443 -v /opt/rpggg/Caddyfile:/etc/caddy/Caddyfile:ro \
  -v rpggg-caddy-data:/data -v rpggg-caddy-config:/config caddy:2 >/dev/null

sudo docker image prune -f >/dev/null
EOF

log "Verificando https://$DOMAIN/api/health"
for _ in $(seq 1 30); do
  if HEALTH="$(curl -fsS "https://$DOMAIN/api/health" 2>/dev/null)"; then
    echo "$HEALTH"
    log "Online: https://$DOMAIN"
    exit 0
  fi
  sleep 5
done
die "o site não respondeu em HTTPS; veja os logs: ${SSH[*]} 'sudo docker logs rpggg-app; sudo docker logs rpggg-caddy'"
