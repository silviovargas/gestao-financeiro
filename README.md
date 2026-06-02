# 💰 Gestão Financeira

Sistema financeiro completo para pequenas empresas. Controle de contas, lançamentos, relatórios DRE, planejamento com IA e muito mais.

---

## ✨ Funcionalidades

- **Finanças** — Lançamentos, contas a pagar/receber, parcelamento, dar baixa com multa/desconto
- **Relatórios** — DRE com projeção futura, segregação PF/PJ, exportação CSV
- **Planejamento** — Score de saúde financeira, simulador de dívidas, caixinhas de reserva, fluxo de caixa 12 meses
- **Assistente IA** — Chat financeiro via Groq/Llama (gratuito)
- **Checklist** — Rotinas diárias/semanais/mensais com progresso por usuário
- **Investimentos** — Metas e simulador de rendimentos
- **Multi-usuário** — Admin, gestor e operacional com permissões granulares
- **PWA** — Instala como app no celular e no computador
- **Docker** — Deploy com um comando, HTTPS automático via Let's Encrypt

---

## 🚀 Instalação rápida (VPS pública)

### Pré-requisitos
- VPS com Ubuntu 20+ (mínimo 1GB RAM)
- Portas 80 e 443 abertas
- Domínio com DNS apontando para o IP da VPS

### Instalar

```bash
curl -sSL https://raw.githubusercontent.com/silviovargas/gestao-financeiro/main/install.sh | bash -s gestao.suaempresa.com.br email@suaempresa.com.br
```

Após alguns minutos, acesse `https://gestao.suaempresa.com.br`

**Login inicial:**
- E-mail: `admin@gestao.com`
- Senha: `123456`

> ⚠️ **Troque a senha imediatamente após o primeiro acesso!**

### Atualizar

```bash
cd ~/gestao-financeiro && bash update.sh
```

---

## 💻 Uso local (rede interna)

Para rodar na rede local sem HTTPS:

```bash
git clone https://github.com/silviovargas/gestao-financeiro
cd gestao-financeiro
cp .env.example .env
# Edite o .env se necessário
docker compose -f docker-compose.local.yml up -d
```

Acesse: `http://localhost:3000`

---

## ⚙️ Configuração (.env)

| Variável | Descrição | Padrão |
|---|---|---|
| `DOMAIN` | Domínio do sistema | — |
| `EMAIL` | E-mail para SSL | — |
| `ADMIN_EMAIL` | E-mail do admin inicial | `admin@gestao.com` |
| `ADMIN_PASSWORD` | Senha do admin inicial | `123456` |
| `JWT_SECRET` | Chave secreta JWT | gerado automaticamente |
| `APP_NAME` | Nome exibido no sistema | `Gestão Financeira` |

---

## 🐳 Gerenciar containers

```bash
# Ver status
docker ps | grep gf-

# Ver logs em tempo real
docker logs gf-app -f

# Reiniciar
docker restart gf-app

# Parar tudo
cd ~/gestao-financeiro && docker compose down

# Backup do banco
docker cp gf-app:/app/data/database.db ./backup-$(date +%Y%m%d).db
```

---

## 📱 Instalar como app (PWA)

Após acessar o sistema via HTTPS:

- **Android/Chrome:** Banner "Instalar" aparece automaticamente
- **Windows/Chrome ou Edge:** Ícone ⊕ na barra de endereço
- **iPhone/Safari:** Compartilhar → "Adicionar à Tela de Início"

---

## 🤖 Assistente IA (gratuito)

1. Crie uma conta gratuita em [console.groq.com](https://console.groq.com)
2. Gere uma API Key (começa com `gsk_`)
3. No sistema: **Planejamento → aba 🤖 Assistente IA → Cole a chave**

---

## 📄 Licença

MIT — use, modifique e distribua livremente.
