#!/bin/bash
# ─────────────────────────────────────────────────────────
# Gestão Financeira — Atualizador
# Uso: cd ~/gestao-financeiro && bash update.sh
# ─────────────────────────────────────────────────────────
set -e

INSTALL_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$INSTALL_DIR"

echo "🔄 Atualizando Gestão Financeira..."
echo ""

# Backup do banco antes de atualizar
if docker ps | grep -q "gf-app"; then
  echo "💾 Fazendo backup do banco..."
  BACKUP="$HOME/backup-gf-$(date +%Y%m%d-%H%M).db"
  docker cp gf-app:/app/data/database.db "$BACKUP" 2>/dev/null && \
    echo "   Backup salvo: $BACKUP ✓" || \
    echo "   ⚠️  Backup falhou (banco pode não existir ainda)"
fi

# Atualizar código
echo "📥 Baixando atualizações..."
git pull

# Rebuild e reiniciar
echo "🔨 Rebuild da imagem..."
docker compose build --no-cache 2>&1 | tail -3

echo "▶️  Reiniciando serviços..."
docker compose up -d

sleep 5

if docker ps | grep -q "gf-app"; then
  VERSION=$(git log --oneline -1 2>/dev/null || echo "desconhecida")
  echo ""
  echo "✅ Atualizado com sucesso!"
  echo "   Versão: $VERSION"
  echo ""
  docker ps | grep gf-
else
  echo "❌ Erro ao reiniciar. Veja os logs:"
  docker logs gf-app 2>&1 | tail -20
  echo ""
  echo "Para restaurar o backup:"
  echo "  docker cp $BACKUP gf-app:/app/data/database.db"
  echo "  docker restart gf-app"
fi
