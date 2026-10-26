# DoceFefe.21 🦸

Site de encomendas de doces. O cliente monta o pedido, é levado ao WhatsApp com a
mensagem pronta, e a dona da loja aprova pelo painel — cada aprovação atualiza a
planilha de controle em Excel.

Feito em **Python (FastAPI)** + **HTML/CSS/JS puro**. Sem Node, sem build, sem
serviço pago.

---

## Como ligar o site

Dê **dois cliques em `iniciar.bat`**. É o jeito mais simples: ele abre o
PowerShell já configurado e liga o site.

Ou, se preferir o terminal, abra o PowerShell nesta pasta e rode:

```powershell
.\iniciar.ps1
```

Na primeira vez ele prepara tudo sozinho (demora um pouco). Depois é só abrir:

| Para quem | Endereço |
|---|---|
| Cliente (o link que vocês mandam) | <http://localhost:8003> |
| Painel da sua mãe | <http://localhost:8003/admin> |
| Testar no celular (mesmo Wi-Fi) | o endereço que o script mostra na tela |

Para desligar: `Ctrl + C` na janela do PowerShell.

> 💡 Na primeira vez que abrir no navegador, dê **Ctrl + F5**. Senão ele
> reaproveita o visual antigo que ficou guardado.

### Se der erro ao rodar

O `iniciar.ps1` é escrito **só com letras sem acento, de propósito**. O
PowerShell do Windows lê o arquivo como ANSI, e um acento ou travessão vira
caractere estranho — um deles (`"`) o PowerShell entende como fim de texto e o
script quebra com *"a cadeia de caracteres não tem o terminador"*. Se for editar
esse arquivo, não use acentos nem `—`.

---

## Antes de usar de verdade

### 1. A logo

Salve a imagem da logo como:

```
app/static/img/logo.png
```

Ela aparece no topo do site, no painel, no ícone da aba e na prévia do link
quando vocês mandarem no WhatsApp. Enquanto o arquivo não existir, o site mostra
um emoji no lugar — nada quebra.

### 2. O arquivo `.env`

Abra o `.env` e preencha:

```ini
LOJA_NOME=DoceFefe.21

# WhatsApp da sua mãe, com 55 + DDD, só números.
# (11) 98765-4321  ->  5511987654321
WHATSAPP_NUMERO=5511987654321

# Senha do painel
ADMIN_SENHA=escolha-uma-senha

# Chave do cookie de login. Gere assim:
#   .\.venv\Scripts\python.exe -c "import secrets; print(secrets.token_hex(32))"
SECRET_KEY=...

# Antecedência mínima para encomendar. 1 = só a partir de amanhã.
ANTECEDENCIA_DIAS=1
```

> ⚠️ O `.env` tem senha e telefone. Ele já está no `.gitignore` — não mande para
> lugar nenhum. Cuidado para não editar o `.env.example` por engano: o site não
> lê esse arquivo, e ele **não** é protegido pelo `.gitignore`.

> 🔁 **O `.env` só é lido quando o site liga.** Depois de mudar qualquer coisa
> nele, feche a janela (`Ctrl + C`) e abra de novo. Para conferir qual número
> está valendo, olhe o canto direito das abas do painel: ele mostra
> *"📱 Pedidos chegam em (11) 9xxxx-xxxx"*.

### 3. O cardápio

Os três doces iniciais (pão de mel, alfajor, brownie) já vêm cadastrados com
preços de exemplo. **Corrija os preços** na aba *Meus doces* do painel.

---

## Como funciona

### Para o cliente

1. Abre o link e escolhe os doces e as quantidades.
2. Preenche nome, WhatsApp, data e se vai buscar ou quer entrega.
3. Ao enviar, o pedido é salvo e ele cai no WhatsApp da sua mãe com tudo escrito:

```
*NOVO PEDIDO — DoceFefe.21*

*Cliente:* Beatriz
*Telefone:* (11) 98765-4321

*Itens:*
• 8x Pão de mel — R$ 64,00

*Total:* R$ 64,00
*Para quando:* 27/10/2026
*Entrega:* Cliente vai buscar

_Pedido #12 — aguardando sua confirmação_
```

### Para a sua mãe (`/admin`)

**Aba Pedidos**
- Vê tudo que chegou, com quanto falta para cada entrega (*é hoje!*, *é amanhã*).
- **Aprovar / Recusar / Marcar entregue** — a planilha é regerada a cada clique.
- **✏ Editar** — muda quantidades, troca doces, muda a data, o endereço e as
  observações. Útil quando o cliente muda de ideia pelo WhatsApp.
- **💬 Falar com o cliente** — abre o WhatsApp do cliente direto.
- **⬇ Baixar planilha (Excel)** — a planilha de controle, ordenada por data de
  entrega, com filtro e total.

**Aba Meus doces**
- Criar doce novo, mudar preço, descrição, emoji.
- **Enviar foto** do doce, direto do celular. Aceita qualquer formato de câmera,
  inclusive HEIC do iPhone, até 20 MB. O site cuida do resto sozinho: endireita
  a foto deitada, reduz para 1200px, converte para JPEG leve (~100 KB) e
  **apaga os metadados**, que no celular guardam a localização de onde a foto
  foi tirada.
- Esconder um doce do site sem apagar (pedidos antigos continuam intactos).

> 💡 Preço antigo é preservado: se ela subir o preço do pão de mel hoje, os
> pedidos feitos ontem continuam valendo o preço de ontem.

---

## A planilha

Fica em `exports/pedidos.xlsx` e é **regerada automaticamente** a cada aprovação,
recusa, edição ou exclusão. Colunas:

| Pedido | Situação | Cliente | Telefone | Data da entrega | Dia da semana | Como receber | Endereço | Itens | Total (R$) | Observações | Pedido feito em |
|---|---|---|---|---|---|---|---|---|---|---|---|

Ordenada pela data de entrega mais próxima, com filtro no cabeçalho e uma linha
de **TOTAL** somando só o que está aprovado ou entregue.

---

## Mapa do projeto

```
DocesFefe/
├── iniciar.ps1              ← liga o site
├── .env                     ← senha e WhatsApp (não versionar)
├── docesfefe.db             ← banco SQLite (criado sozinho)
├── exports/pedidos.xlsx     ← planilha de controle
└── app/
    ├── main.py              ← monta o servidor
    ├── config.py            ← lê o .env
    ├── models.py            ← Produto, Pedido, ItemPedido
    ├── schemas.py           ← validação dos formulários
    ├── whatsapp.py          ← monta a mensagem e o link wa.me
    ├── planilha.py          ← gera o Excel
    ├── fotos.py             ← recebe e valida as fotos dos doces
    ├── seed.py              ← cardápio inicial
    ├── migracoes.py         ← ajustes de banco entre versões
    ├── routers/
    │   ├── public.py        ← site do cliente
    │   └── admin.py         ← painel
    ├── templates/           ← index, admin, login
    └── static/              ← css, js, imagens
```

---

## Publicar na internet

Hoje roda só no computador de vocês. Para gerar um link que funcione em qualquer
lugar, o caminho mais simples é **Render** ou **Railway** (ambos com plano
gratuito e suporte a Python). É preciso trocar duas coisas:

1. O SQLite some a cada deploy nesses planos — usar um disco persistente ou
   trocar para Postgres (ambos têm opção gratuita).
2. Ligar `https_only=True` no cookie de sessão (`app/main.py`).

Me chame quando quiserem publicar que eu preparo.
