#!/bin/bash
# ─────────────────────────────────────────────────────────
# Gestão Financeira — Instalador
# Uso: curl -sSL URL/install.sh | bash -s dominio.com email@exemplo.com
# ─────────────────────────────────────────────────────────
set -e

DOMAIN=$1
EMAIL=$2
INSTALL_DIR="$HOME/gestao-financeiro"
REPO="https://github.com/SEU_USUARIO/gestao-financeiro"

# Verificar argumentos
if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
  echo "Uso: curl -sSL URL/install.sh | bash -s SEU_DOMINIO SEU_EMAIL"
  echo "Exemplo: curl -sSL URL/install.sh | bash -s gestao.empresa.com.br admin@empresa.com.br"
  exit 1
fi

echo "🚀 Instalando Gestão Financeira"
echo "   Domínio : $DOMAIN"
echo "   E-mail  : $EMAIL"
echo ""

# Verificar Docker
if ! command -v docker &>/dev/null; then
  echo "📦 Instalando Docker..."
  curl -fsSL https://get.docker.com | sh
  usermod -aG docker "$USER" 2>/dev/null || true
fi
echo "   Docker: $(docker -v | cut -d' ' -f3 | tr -d ',') ✓"

# Verificar Git
if ! command -v git &>/dev/null; then
  apt-get install -y git 2>/dev/null || yum install -y git 2>/dev/null || true
fi

# Clonar repositório
if [ -d "$INSTALL_DIR" ]; then
  echo "📁 Pasta $INSTALL_DIR já existe. Atualizando..."
  cd "$INSTALL_DIR" && git pull
else
  echo "📥 Clonando repositório..."
  git clone "$REPO" "$INSTALL_DIR"
fi
cd "$INSTALL_DIR"

# Gerar JWT_SECRET aleatório
JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || cat /dev/urandom | tr -dc 'a-f0-9' | fold -w 64 | head -n 1)

# Criar .env
echo "⚙️  Configurando..."
cat > .env << EOF
DOMAIN=$DOMAIN
EMAIL=$EMAIL
ADMIN_EMAIL=admin@gestao.com
ADMIN_PASSWORD=123456
JWT_SECRET=$JWT_SECRET
APP_NAME=Gestão Financeira
EOF
echo "   .env criado ✓"

# Verificar DNS
echo "🔍 Verificando DNS..."
VPS_IP=$(curl -s --max-time 5 ifconfig.me 2>/dev/null || echo "?")
DNS_IP=$(getent hosts "$DOMAIN" 2>/dev/null | awk '{print $1}' || true)

if [ "$DNS_IP" != "$VPS_IP" ] && [ -n "$DNS_IP" ]; then
  echo "   ⚠️  DNS: $DOMAIN → $DNS_IP (IP desta VPS: $VPS_IP)"
  echo "   Configure o DNS antes de continuar:"
  echo "   Tipo A | Nome: ${DOMAIN%%.*} | Valor: $VPS_IP"
  echo ""
  read -p "   Continuar mesmo assim? (s/N) " resp
  [[ "$resp" =~ ^[Ss]$ ]] || exit 0
fi

# Build e subir
echo "🔨 Build da imagem (pode demorar 2-3 minutos)..."
docker compose build --no-cache 2>&1 | tail -3

echo "▶️  Subindo serviço..."
docker compose up -d

# Aguardar
echo "⏳ Aguardando inicialização..."
sleep 10

if docker ps | grep -q "gf-app"; then
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "✅ Instalação concluída!"
  echo ""
  echo "🌐  https://$DOMAIN"
  echo "    (SSL pode demorar até 2 minutos para ativar)"
  echo ""
  echo "🔑  Login inicial:"
  echo "    E-mail: admin@gestao.com"
  echo "    Senha : 123456"
  echo ""
  echo "⚠️  Troque a senha após o primeiro acesso!"
  echo ""
  echo "📁  Instalado em: $INSTALL_DIR"
  echo ""
  echo "🔄  Para atualizar no futuro:"
  echo "    cd $INSTALL_DIR && bash update.sh"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
else
  echo "❌ Algo deu errado. Veja os logs:"
  docker logs gf-app 2>&1 | tail -20
fi
