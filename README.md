# DOCEFEFE.21 🦸

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
LOJA_NOME=DOCEFEFE.21

# WhatsApp da sua mãe, com 55 + DDD, só números.
# (11) 98765-4321  ->  5511987654321
WHATSAPP_NUMERO=5511987654321

# Perfil do Instagram. O botão do topo do site leva para cá.
INSTAGRAM_URL=https://www.instagram.com/docefefe.21

# Senha do painel
ADMIN_SENHA=escolha-uma-senha

# Chave do cookie de login. Gere assim:
#   .\.venv\Scripts\python.exe -c "import secrets; print(secrets.token_hex(32))"
SECRET_KEY=...

# Antecedência mínima para encomendar. 1 = só a partir de amanhã.
ANTECEDENCIA_DIAS=1

# Banco. Vazio = arquivo local. Veja "Levar o banco para o Supabase".
DATABASE_URL=
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
*NOVO PEDIDO — DOCEFEFE.21*

*Cliente:* Beatriz
*Telefone:* (11) 98765-4321

*Itens:*
• 8x Pão de mel — R$ 64,00

*Total:* R$ 64,00
*Para quando:* 27/10/2026
*Entrega:* Cliente vai buscar

_Pedido realizado pelo site — aguardando sua confirmação_
```

No topo do site: **botão do Instagram** e **"Fazer meu pedido"** à esquerda, a
frase no meio com o **T 2 1** logo abaixo, e a **logo à direita**. No celular
isso vira uma coluna só — logo, frase, T21 e os dois botões largos embaixo, que
é onde o polegar alcança.

> 📱 **Tudo é feito pelo celular**, tanto o cliente quanto sua mãe no painel.
> Por isso os botões têm no mínimo 44px de altura (o tamanho em que o dedo não
> erra) e as telas foram conferidas em 360px e 390px de largura, sem nada
> vazando para fora. Se for mexer no CSS, confira nessas larguras.

> 🔢 **O cliente nunca vê número de pedido.** O número é o id do banco e vinha
> sendo lido como "este é o meu sétimo pedido". No painel da sua mãe o
> `Pedido #7` continua aparecendo, que é onde ele serve para alguma coisa.

### Para a sua mãe (`/admin`)

**Aba Pedidos**
- Vê tudo que chegou, com quanto falta para cada entrega (*é hoje!*, *é amanhã*).
- **✚ Novo pedido** — para quem encomenda **sem usar o site** (pelo WhatsApp,
  pessoalmente, na feira). Pede nome, doces, data e forma de entrega; o
  **telefone é opcional**, porque venda de balcão nem sempre tem um para anotar
  (sem telefone, o cartão simplesmente não mostra o botão de WhatsApp).
  Na hora de cadastrar dá para escolher a situação:
  - *Aprovado* — já combinei, vou preparar (é o normal);
  - *Entregue* — já entreguei e recebi. Serve para **lançar venda antiga** e a
    aba Recebimentos ficar certa;
  - *Aguardando confirmação* — ainda vou confirmar com a pessoa.
- **Aprovar / Recusar / Marcar entregue** — a planilha é regerada a cada clique.
- **✏ Editar** — muda nome, telefone, quantidades, troca doces, muda a data, o
  endereço e as observações. Útil quando o cliente muda de ideia pelo WhatsApp.
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

**Aba Recebimentos**
- Quanto entrou, em **gráfico** e em **tabela**, agrupado por **dia, mês ou ano**.
- Filtro por período: atalhos (*últimos 30 dias*, *último ano*, *tudo*) ou um
  intervalo escolhido à mão. O filtro vale para os quatro cartões, o gráfico e a
  tabela ao mesmo tempo — os números nunca discordam entre si.
- Passando o mouse (ou com o Tab, pelo teclado) cada barra mostra o valor, o
  número de pedidos e quantos doces saíram naquele período.

> 💰 **O que conta como recebido:** só o pedido já marcado como **entregue**, e
> o valor cai na **data da entrega**. Aprovado ainda pode furar, por isso não
> entra. Quem quer ver o que está por vir usa o cartão *A receber* na aba
> Pedidos.

> 📅 Mês sem nenhuma entrega aparece zerado no gráfico, de propósito: sem isso
> dois meses vizinhos no eixo poderiam estar a um ano de distância. Em "por
> dia", se o intervalo passar de 3 meses, só os dias com entrega aparecem —
> senão seriam centenas de barras vazias.

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
├── migrar_para_supabase.py  ← leva o banco local para o Supabase
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

## Levar o banco para o Supabase

O código **já está pronto** para Postgres: enquanto `DATABASE_URL` estiver vazia
no `.env`, o site usa o arquivo local de sempre; assim que você colar a conexão,
ele passa a usar o Supabase. Nada mais muda.

### 1. Criar o projeto

Em <https://supabase.com>, **New project**. Na tela de criação:

| Campo | O que pôr |
|---|---|
| **Nome do projeto** | `docefefe` (ou o que quiser) |
| **Senha do banco de dados** | Uma senha forte **só com letras e números**. **Copie e guarde** — ela aparece uma vez só. |
| **Região** | Abra a lista e escolha **South America (São Paulo)** — quanto mais perto, mais rápido. "Américas" sozinho não basta. |
| **Habilitar API de Dados** | **Desmarque.** |
| GitHub | Pode ignorar. |

Depois espere uns dois minutos até o projeto ficar verde.

> 🔑 **Por que a senha só com letras e números:** `@`, `/`, `#` e `:` têm
> significado especial dentro do endereço de conexão e quebram a leitura dele.
> Se você já gerou uma senha com esses caracteres, troque em
> *Settings → Database → Reset database password*.

> 🔒 **Por que desmarcar a API de Dados:** ela publica as tabelas numa API REST
> aberta. Nosso site não usa essa API — ele conecta direto no Postgres. E como
> as tabelas são criadas pelo `migrar_para_supabase.py`, e não pela tela do
> Supabase, elas não ganham a trava de segurança por linha sozinhas: nome,
> telefone e endereço dos clientes ficariam acessíveis a quem tivesse a chave
> pública do projeto. Se você já criou o projeto com ela marcada, tudo bem — o
> script liga a trava (*Row Level Security*) nas três tabelas no fim da
> migração.

### 2. Pegar a connection string

No projeto: botão **Connect**, no topo → aba **Connection string** → escolha
**Session pooler**. Vai aparecer algo assim:

```
postgresql://postgres.abcdefgh:[YOUR-PASSWORD]@aws-1-sa-east-1.pooler.supabase.com:5432/postgres
```

Troque `[YOUR-PASSWORD]` pela senha do passo 1 e cole no `.env`:

```ini
DATABASE_URL=postgresql://postgres.abcdefgh:SUA_SENHA@aws-1-sa-east-1.pooler.supabase.com:5432/postgres
```

> Use o **Session pooler**, não o "Direct connection": a conexão direta só
> funciona em rede com IPv6, e a da sua casa provavelmente não tem.

> Se a senha tiver `@`, `/`, `#` ou `:`, troque a senha do banco por uma só com
> letras e números (Settings → Database → Reset database password). Esses
> caracteres confundem a leitura do endereço.

### 3. Instalar a biblioteca do Postgres e migrar

Com o site **desligado** (`Ctrl + C`), rode na pasta do projeto:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe migrar_para_supabase.py
```

O script cria as tabelas lá e copia os doces e **todos os pedidos**, mantendo os
mesmos números. Ele só grava se o banco de destino estiver vazio — se você já
tiver ligado o site antes de migrar, ele avisa e não faz nada, para não
misturar dois cardápios.

Depois é só `.\iniciar.ps1` de sempre. Para conferir que foi, abra o Supabase em
**Table Editor** e veja as tabelas `produtos`, `pedidos` e `itens_pedido`.

### Voltar atrás

Apague o conteúdo do `DATABASE_URL` no `.env` e ligue de novo: o site volta a
usar o `docesfefe.db`, que continua intacto no computador.

> ⚠️ As **fotos dos doces** continuam sendo arquivos em
> `app/static/img/produtos`, no computador — elas não vão para o Supabase. O
> banco online é o começo do caminho; para o site ficar no ar de verdade ainda
> falta hospedar o Python (Render ou Railway) e ligar `https_only=True` no
> cookie de sessão em `app/main.py`. Me chame quando quiserem essa parte.
