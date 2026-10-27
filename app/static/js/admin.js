// Painel do DoceFefe — pedidos (ver, aprovar, editar) e cardápio (criar, editar, foto).

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

// "abertos" = pendentes + aprovados. Entregue e recusado só nas abas deles.
let filtroAtual = 'abertos';
let produtosCache = [];
let pedidoEditando = null;
let fotoPendente = null; // foto escolhida para um doce que ainda não existe

const escapar = (txt) => {
  const div = document.createElement('div');
  div.textContent = txt ?? '';
  return div.innerHTML;
};

const brl = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

async function api(caminho, opcoes = {}) {
  const resp = await fetch(caminho, opcoes);
  if (resp.status === 401) {
    window.location.assign('/admin/login');
    throw new Error('sessão expirada');
  }
  const corpo = resp.status === 204 ? null : await resp.json().catch(() => null);
  if (!resp.ok) throw new Error(corpo?.detail || 'Não foi possível concluir.');
  return corpo;
}

function abrirModal(id) { $(`#${id}`).classList.remove('oculto'); }
function fecharModal(id) { $(`#${id}`).classList.add('oculto'); }

// =====================================================================
// ABAS
// =====================================================================
$('#abas').addEventListener('click', (ev) => {
  const botao = ev.target.closest('.aba');
  if (!botao) return;
  $$('.aba').forEach((b) => b.classList.toggle('ativa', b === botao));
  const alvo = botao.dataset.aba;
  $('#aba-pedidos').classList.toggle('oculto', alvo !== 'pedidos');
  $('#aba-doces').classList.toggle('oculto', alvo !== 'doces');
  $('#aba-recebimentos').classList.toggle('oculto', alvo !== 'recebimentos');
  if (alvo === 'doces') carregarDoces();
  if (alvo === 'recebimentos') carregarRecebimentos();
});

// =====================================================================
// PEDIDOS
// =====================================================================
async function carregarPedidos() {
  const alvo = $('#lista-pedidos');
  let dados;
  try {
    dados = await api(`/admin/api/pedidos?status=${filtroAtual}`);
  } catch {
    alvo.innerHTML = '<p class="vazio">Erro ao carregar. Atualize a página.</p>';
    return;
  }

  const r = dados.resumo;
  $('#r-pendentes').textContent = r.pendentes;
  $('#r-aprovados').textContent = r.aprovados;
  $('#r-entregar').textContent = r.a_entregar;
  $('#r-faturamento').textContent = r.faturamento_previsto;

  if (!dados.pedidos.length) {
    alvo.innerHTML = filtroAtual === 'abertos'
      ? '<p class="vazio">Nada pendente por aqui. Tudo em dia! 🧁</p>'
      : '<p class="vazio">Nenhum pedido nesta lista.</p>';
    return;
  }
  alvo.innerHTML = dados.pedidos.map(cartaoPedido).join('');
  // Guardamos os dados completos para abrir a edição sem ir ao servidor de novo.
  window.__pedidos = Object.fromEntries(dados.pedidos.map((p) => [p.id, p]));
}

function prazo(dias) {
  if (dias < 0) return `<span class="urgente">(${Math.abs(dias)} dia(s) atrás)</span>`;
  if (dias === 0) return '<span class="urgente">(é hoje!)</span>';
  if (dias === 1) return '<span class="urgente">(é amanhã)</span>';
  return `<span style="color:var(--texto-suave)">(em ${dias} dias)</span>`;
}

function cartaoPedido(p) {
  const itens = p.itens
    .map((i) => `<div><span>${i.quantidade}x ${escapar(i.nome)}</span><span>${i.subtotal_formatado}</span></div>`)
    .join('');

  const linhaEndereco = p.modo === 'entrega'
    ? `<div><b>Endereço</b><span>${escapar(p.endereco)}</span></div>` : '';
  const linhaObs = p.observacoes
    ? `<div><b>Observações</b><span>${escapar(p.observacoes)}</span></div>` : '';

  // Pedido cadastrado na mão pode não ter telefone (venda de balcão). Sem ele,
  // nada de linha vazia nem botão de WhatsApp que não leva a lugar nenhum.
  const temZap = Boolean(p.telefone_bruto);
  const zap = `https://wa.me/55${p.telefone_bruto.replace(/^55/, '')}`;
  const linhaTelefone = temZap ? `<div><b>Telefone</b><span>${p.telefone}</span></div>` : '';
  const botaoZap = temZap
    ? `<a class="btn-acao zap" href="${zap}" target="_blank" rel="noopener">💬 Falar com o cliente</a>`
    : '';

  let botoes = '';
  if (p.status === 'pendente') {
    botoes = `
      <button class="btn-acao aprovar" data-id="${p.id}" data-novo="aprovado">✓ Aprovar</button>
      <button class="btn-acao recusar" data-id="${p.id}" data-novo="recusado">✕ Recusar</button>`;
  } else if (p.status === 'aprovado') {
    botoes = `
      <button class="btn-acao" data-id="${p.id}" data-novo="entregue">📦 Marcar entregue</button>
      <button class="btn-acao" data-id="${p.id}" data-novo="pendente">↩ Voltar p/ pendente</button>`;
  } else {
    botoes = `<button class="btn-acao" data-id="${p.id}" data-novo="pendente">↩ Reabrir</button>`;
  }

  return `
    <article class="pedido" data-status="${p.status}">
      <div class="pedido-cabecalho">
        <div>
          <h3>${escapar(p.cliente_nome)}</h3>
          <span class="pedido-id">Pedido #${p.id} · feito em ${p.criado_em}</span>
        </div>
        <span class="etiqueta ${p.status}">${p.status_label}</span>
      </div>

      <div class="pedido-linhas">
        <div><b>Para quando</b><span>${p.data_entrega} ${prazo(p.dias_restantes)}</span></div>
        <div><b>Como receber</b><span>${p.modo_label}</span></div>
        ${linhaEndereco}
        ${linhaTelefone}
        ${linhaObs}
      </div>

      <div class="pedido-itens">
        ${itens}
        <div class="total-linha"><span>Total</span><span>${p.total_formatado}</span></div>
      </div>

      <div class="pedido-botoes">
        ${botoes}
        <button class="btn-acao editar" data-id="${p.id}" data-editar="1">✏ Editar</button>
        ${botaoZap}
        <button class="btn-acao recusar" data-id="${p.id}" data-excluir="1">🗑 Excluir</button>
      </div>
    </article>`;
}

$('#lista-pedidos').addEventListener('click', async (ev) => {
  const botao = ev.target.closest('button[data-id]');
  if (!botao) return;
  const { id, novo, excluir, editar } = botao.dataset;

  if (editar) return abrirEdicaoPedido(Number(id));
  if (excluir && !confirm('Excluir este pedido de vez? Isso não pode ser desfeito.')) return;

  botao.disabled = true;
  try {
    if (excluir) {
      await api(`/admin/api/pedidos/${id}`, { method: 'DELETE' });
    } else {
      await api(`/admin/api/pedidos/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: novo }),
      });
    }
    await carregarPedidos();
  } catch (e) {
    alert(e.message);
    botao.disabled = false;
  }
});

$('#filtros').addEventListener('click', (ev) => {
  const botao = ev.target.closest('.filtro');
  if (!botao) return;
  $$('.filtro').forEach((b) => b.classList.remove('ativo'));
  botao.classList.add('ativo');
  filtroAtual = botao.dataset.status;
  carregarPedidos();
});

// --------------------------------------------------- criar / editar pedido

/** Monta a lista de doces do modal. `pedido` nulo = pedido novo, tudo zerado. */
function montarItensEditor(pedido) {
  // Doces já no pedido (mesmo que desativados) + todos os que estão à venda.
  const noPedido = new Map((pedido?.itens ?? []).map((i) => [i.produto_id, i]));
  $('#ep-itens').innerHTML = [...produtosCache]
    .filter((p) => p.ativo || noPedido.has(p.id))
    .map((p) => {
      const item = noPedido.get(p.id);
      const preco = item ? item.preco_unitario : p.preco;
      return `
        <div class="editor-item" data-id="${p.id}" data-preco="${preco}">
          <span class="editor-nome">${escapar(p.nome)}<small>${brl(preco)}</small></span>
          <div class="contador">
            <button type="button" data-passo="-1">−</button>
            <input type="number" min="0" max="500" value="${item ? item.quantidade : 0}">
            <button type="button" data-passo="1">+</button>
          </div>
        </div>`;
    })
    .join('');
  recalcularEdicao();
}

function prepararModalPedido(pedido) {
  const novo = !pedido;
  pedidoEditando = pedido;

  $('#ep-titulo').textContent = novo ? 'Novo pedido' : 'Editar pedido';
  $('#ep-salvar').textContent = novo ? 'Cadastrar pedido' : 'Salvar alterações';
  $('#ep-campo-status').classList.toggle('oculto', !novo);
  $('#ep-erro').hidden = true;

  $('#ep-id').value = novo ? '' : pedido.id;
  $('#ep-nome').value = novo ? '' : pedido.cliente_nome;
  $('#ep-telefone').value = novo ? '' : pedido.telefone;
  $('#ep-data').value = novo ? '' : pedido.data_entrega_iso;
  $('#ep-obs').value = novo ? '' : pedido.observacoes;
  $('#ep-endereco').value = novo ? '' : pedido.endereco;
  $('#ep-status').value = 'aprovado';

  const modo = novo ? 'retirada' : pedido.modo;
  document.querySelector(`input[name=ep-modo][value="${modo}"]`).checked = true;
  $('#ep-campo-endereco').classList.toggle('oculto', modo !== 'entrega');

  montarItensEditor(pedido);
  abrirModal('modal-pedido');
}

async function abrirEdicaoPedido(id) {
  if (!produtosCache.length) produtosCache = await api('/admin/api/produtos');
  prepararModalPedido(window.__pedidos[id]);
}

$('#btn-novo-pedido').addEventListener('click', async () => {
  if (!produtosCache.length) produtosCache = await api('/admin/api/produtos');
  prepararModalPedido(null);
  $('#ep-nome').focus();
});

function recalcularEdicao() {
  let total = 0;
  $$('#ep-itens .editor-item').forEach((linha) => {
    const qtd = Number(linha.querySelector('input').value) || 0;
    linha.classList.toggle('tem-item', qtd > 0);
    total += qtd * Number(linha.dataset.preco);
  });
  $('#ep-total').textContent = brl(total);
}

$('#ep-itens').addEventListener('click', (ev) => {
  const botao = ev.target.closest('button[data-passo]');
  if (!botao) return;
  const campo = botao.closest('.editor-item').querySelector('input');
  campo.value = Math.max(0, Math.min(500, (Number(campo.value) || 0) + Number(botao.dataset.passo)));
  recalcularEdicao();
});
$('#ep-itens').addEventListener('input', recalcularEdicao);

$$('input[name=ep-modo]').forEach((radio) => {
  radio.addEventListener('change', () => {
    $('#ep-campo-endereco').classList.toggle('oculto', radio.value !== 'entrega');
  });
});

$('#form-pedido-edit').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const erro = $('#ep-erro');
  erro.hidden = true;

  const itens = $$('#ep-itens .editor-item')
    .map((l) => ({ produto_id: Number(l.dataset.id), quantidade: Number(l.querySelector('input').value) || 0 }))
    .filter((i) => i.quantidade > 0);

  if (!itens.length) {
    erro.textContent = 'O pedido precisa ter pelo menos um doce.';
    erro.hidden = false;
    return;
  }
  if ($('#ep-nome').value.trim().length < 2) {
    erro.textContent = 'Escreva o nome do cliente.';
    erro.hidden = false;
    return;
  }
  if (!$('#ep-data').value) {
    erro.textContent = 'Escolha a data da entrega.';
    erro.hidden = false;
    return;
  }

  const id = $('#ep-id').value;          // vazio = cadastro novo
  const modo = document.querySelector('input[name=ep-modo]:checked').value;
  const corpo = {
    cliente_nome: $('#ep-nome').value.trim(),
    cliente_telefone: $('#ep-telefone').value.trim(),
    data_entrega: $('#ep-data').value,
    modo,
    endereco: modo === 'entrega' ? $('#ep-endereco').value.trim() : '',
    observacoes: $('#ep-obs').value.trim(),
    itens,
  };
  if (!id) corpo.status = $('#ep-status').value;

  const botao = $('#ep-salvar');
  botao.disabled = true;
  try {
    await api(id ? `/admin/api/pedidos/${id}` : '/admin/api/pedidos', {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    fecharModal('modal-pedido');
    await carregarPedidos();
  } catch (e) {
    erro.textContent = e.message;
    erro.hidden = false;
  } finally {
    botao.disabled = false;
  }
});

// =====================================================================
// DOCES
// =====================================================================
async function carregarDoces() {
  const alvo = $('#lista-doces');
  try {
    produtosCache = await api('/admin/api/produtos');
  } catch {
    alvo.innerHTML = '<p class="vazio">Erro ao carregar o cardápio.</p>';
    return;
  }

  if (!produtosCache.length) {
    alvo.innerHTML = '<p class="vazio">Nenhum doce cadastrado. Clique em “Novo doce”. 🍫</p>';
    return;
  }

  alvo.innerHTML = produtosCache.map((p) => `
    <article class="doce ${p.ativo ? '' : 'inativo'}">
      <div class="doce-foto">
        ${p.foto_url
          ? `<img src="${escapar(p.foto_url)}" alt="${escapar(p.nome)}">`
          : `<span>${escapar(p.emoji)}</span>`}
      </div>
      <div class="doce-info">
        <h3>${escapar(p.nome)} ${p.ativo ? '' : '<span class="etiqueta entregue">escondido</span>'}</h3>
        <p>${escapar(p.descricao) || '<i>sem descrição</i>'}</p>
        <strong>${brl(p.preco)} <small>/ ${escapar(p.unidade)}</small></strong>
      </div>
      <button class="btn-acao" data-editar-doce="${p.id}">✏ Editar</button>
    </article>`).join('');
}

$('#lista-doces').addEventListener('click', (ev) => {
  const botao = ev.target.closest('[data-editar-doce]');
  if (botao) abrirEdicaoDoce(Number(botao.dataset.editarDoce));
});

$('#btn-novo-doce').addEventListener('click', () => abrirEdicaoDoce(null));

function abrirEdicaoDoce(id) {
  const p = id ? produtosCache.find((x) => x.id === id) : null;
  fotoPendente = null;

  $('#md-titulo').textContent = p ? 'Editar doce' : 'Novo doce';
  $('#md-id').value = p ? p.id : '';
  $('#md-nome').value = p ? p.nome : '';
  $('#md-descricao').value = p ? p.descricao : '';
  $('#md-preco').value = p ? p.preco.toFixed(2).replace('.', ',') : '';
  $('#md-unidade').value = p ? p.unidade : 'unidade';
  $('#md-emoji').value = p ? p.emoji : '🍬';
  $('#md-ativo').value = p && !p.ativo ? '0' : '1';
  $('#md-arquivo').value = '';
  $('#md-erro').hidden = true;

  pintarPrevia(p?.foto_url || '', p?.emoji || '🍬');
  $('#md-remover-foto').classList.toggle('oculto', !p?.foto_url);
  abrirModal('modal-doce');
}

function pintarPrevia(url, emoji) {
  const previa = $('#md-previa');
  previa.innerHTML = url
    ? `<img src="${escapar(url)}" alt="">`
    : escapar(emoji || '🍬');
}

$('#md-arquivo').addEventListener('change', async (ev) => {
  const arquivo = ev.target.files[0];
  if (!arquivo) return;

  if (arquivo.size > 20 * 1024 * 1024) {
    return mostrarErroDoce(
      `A foto tem ${(arquivo.size / 1048576).toFixed(1)} MB e o limite é 20 MB.`);
  }

  // HEIC do iPhone o navegador não consegue desenhar; a prévia real vem do
  // servidor depois da conversão.
  const ehHeic = /\.hei[cf]$/i.test(arquivo.name);
  if (!ehHeic) pintarPrevia(URL.createObjectURL(arquivo), '');

  const id = $('#md-id').value;
  if (!id) {
    // Doce novo ainda não tem id: guardamos e enviamos depois de salvar.
    fotoPendente = arquivo;
    $('#md-remover-foto').classList.remove('oculto');
    if (ehHeic) pintarPrevia('', '📷');
    return;
  }

  const rotulo = $('.rotulo-arquivo');
  const textoOriginal = rotulo.textContent;
  rotulo.textContent = 'Enviando…';
  try {
    const r = await enviarFoto(id, arquivo);
    pintarPrevia(r.foto_url, '');
    $('#md-remover-foto').classList.remove('oculto');
    await carregarDoces();
  } catch (e) {
    mostrarErroDoce(e.message);
    pintarPrevia('', $('#md-emoji').value); // desfaz a prévia que não foi salva
  } finally {
    rotulo.textContent = textoOriginal;
  }
});

async function enviarFoto(id, arquivo) {
  const dados = new FormData();
  dados.append('arquivo', arquivo);
  return api(`/admin/api/produtos/${id}/foto`, { method: 'POST', body: dados });
}

$('#md-remover-foto').addEventListener('click', async () => {
  const id = $('#md-id').value;
  fotoPendente = null;
  $('#md-arquivo').value = '';
  if (id) {
    try {
      await api(`/admin/api/produtos/${id}/foto`, { method: 'DELETE' });
      await carregarDoces();
    } catch (e) {
      return mostrarErroDoce(e.message);
    }
  }
  pintarPrevia('', $('#md-emoji').value);
  $('#md-remover-foto').classList.add('oculto');
});

function mostrarErroDoce(mensagem) {
  const erro = $('#md-erro');
  erro.textContent = mensagem;
  erro.hidden = false;
}

$('#form-doce').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  $('#md-erro').hidden = true;

  const preco = Number($('#md-preco').value.replace(/\./g, '').replace(',', '.'));
  if (!preco || preco <= 0) return mostrarErroDoce('Informe um preço válido. Ex.: 8,00');

  const corpo = {
    nome: $('#md-nome').value.trim(),
    descricao: $('#md-descricao').value.trim(),
    emoji: $('#md-emoji').value.trim() || '🍬',
    preco,
    unidade: $('#md-unidade').value.trim() || 'unidade',
    ativo: $('#md-ativo').value === '1',
  };

  const id = $('#md-id').value;
  const botao = $('#md-salvar');
  botao.disabled = true;
  try {
    const resp = await api(id ? `/admin/api/produtos/${id}` : '/admin/api/produtos', {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    if (!id && fotoPendente) await enviarFoto(resp.id, fotoPendente);

    fecharModal('modal-doce');
    await carregarDoces();
  } catch (e) {
    mostrarErroDoce(e.message);
  } finally {
    botao.disabled = false;
  }
});

// =====================================================================
document.addEventListener('click', (ev) => {
  const fechar = ev.target.closest('[data-fechar]');
  if (fechar) fecharModal(fechar.dataset.fechar);
  // Clicar no fundo escuro também fecha.
  if (ev.target.classList.contains('modal')) ev.target.classList.add('oculto');
});
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape') $$('.modal').forEach((m) => m.classList.add('oculto'));
});

// =====================================================================
// RECEBIMENTOS — quanto entrou por dia / mês / ano
// =====================================================================
// Azul da marca clareado até passar nos testes de contraste e daltonismo
// (o #17346B da logo é escuro demais para barra sobre fundo branco).
const COR_BARRA = '#2F5FC0';
const COR_BARRA_CLARA = '#4F86DC';
const COR_GRADE = '#E3E7EF';
const COR_EIXO = '#6E7A91';
const COR_TEXTO = '#1B2A45';

const SVG_NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs) => {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};

const NOME_GRAN = { dia: 'dia', mes: 'mês', ano: 'ano' };
let recGran = 'mes';
let recPeriodos = [];
// Cada busca leva um número. Trocar de filtro rápido dispara duas, e a antiga
// pode voltar depois da nova — sem isto a tela fica com o dado errado.
let recBusca = 0;

/** Eixo com números redondos: 0 / 50 / 100 / 150, nunca 0 / 47,3 / 94,6. */
function tetoBonito(maior) {
  if (maior <= 0) return { teto: 10, passo: 5 };
  const alvo = maior / 4; // queremos ~4 faixas
  const potencia = 10 ** Math.floor(Math.log10(alvo));
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * potencia).find((p) => p >= alvo);
  return { teto: Math.ceil(maior / passo) * passo, passo };
}

const rotuloEixo = (v) =>
  v >= 1000
    ? `R$ ${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`
    : `R$ ${v.toLocaleString('pt-BR')}`;

/** Barra com o topo arredondado (4px) e o pé reto, encostado na linha do zero. */
function caminhoBarra(x, y, larg, alt, r) {
  const raio = Math.min(r, larg / 2, alt);
  return `M${x},${y + alt} L${x},${y + raio} Q${x},${y} ${x + raio},${y}`
    + ` L${x + larg - raio},${y} Q${x + larg},${y} ${x + larg},${y + raio}`
    + ` L${x + larg},${y + alt} Z`;
}

function esconderDica() { $('#rec-dica').classList.add('oculto'); }

function mostrarDica(p, marca) {
  const dica = $('#rec-dica');
  // textContent, nunca innerHTML: o rótulo vem do servidor, mas o nome do doce
  // que um dia entre aqui vem do cliente.
  dica.textContent = '';
  const valor = document.createElement('strong');
  valor.textContent = p.total_formatado;
  const detalhe = document.createElement('span');
  detalhe.textContent = `${p.rotulo_longo} · ${p.pedidos} pedido(s) · ${p.doces} doce(s)`;
  dica.append(valor, detalhe);
  dica.classList.remove('oculto');

  const area = $('.grafico-area').getBoundingClientRect();
  const alvo = marca.getBoundingClientRect();

  // Centraliza na barra, mas sem deixar a dica vazar para fora do quadro.
  const meio = alvo.left - area.left + alvo.width / 2;
  const metade = dica.offsetWidth / 2;
  dica.style.left = `${Math.max(metade + 4, Math.min(meio, area.width - metade - 4))}px`;

  // Em cima da ponta da barra. Se a barra for alta demais e a dica for parar
  // fora do quadro, ela desce para dentro dela.
  const topo = alvo.top - area.top;
  const cabe = topo - dica.offsetHeight - 8 >= 0;
  dica.style.top = `${cabe ? topo - 8 : topo + dica.offsetHeight + 16}px`;
}

function desenharGrafico() {
  const alvo = $('#rec-grafico');
  alvo.textContent = '';
  if (!recPeriodos.length) {
    alvo.innerHTML = '<p class="vazio">Nenhuma entrega registrada neste período ainda.</p>';
    return;
  }

  const ESQ = 72, DIR = 18, TOPO = 30, BASE = 40, ALTURA = 290;
  // 16px por barra é o mínimo para o gráfico continuar legível. "Por dia" em
  // dois meses dá ~57 barras: com folga maior que isso viraria 2000px de
  // rolagem lateral para ver meia dúzia de entregas.
  const largura = Math.max(alvo.clientWidth || 620, ESQ + DIR + recPeriodos.length * 16);
  const plotL = largura - ESQ - DIR;
  const plotA = ALTURA - TOPO - BASE;

  const maior = Math.max(...recPeriodos.map((p) => p.total), 0);
  const { teto, passo } = tetoBonito(maior);
  const svg = svgEl('svg', {
    width: largura, height: ALTURA, viewBox: `0 0 ${largura} ${ALTURA}`,
    role: 'img',
    'aria-label': `Gráfico de barras do recebido por ${NOME_GRAN[recGran]}.`
      + ' Os mesmos valores estão na tabela logo abaixo.',
  });

  // Grade: fininha e discreta, só para o olho achar a altura.
  for (let v = 0; v <= teto + 0.0001; v += passo) {
    const y = TOPO + plotA - (v / teto) * plotA;
    svg.appendChild(svgEl('line', {
      x1: ESQ, x2: largura - DIR, y1: y, y2: y,
      stroke: v === 0 ? COR_EIXO : COR_GRADE, 'stroke-width': 1,
    }));
    const t = svgEl('text', {
      x: ESQ - 10, y: y + 4, 'text-anchor': 'end', fill: COR_EIXO,
      'font-size': 11, 'font-weight': 600, 'font-variant-numeric': 'tabular-nums',
    });
    t.textContent = rotuloEixo(v);
    svg.appendChild(t);
  }

  const fatia = plotL / recPeriodos.length;
  // 2px de respiro entre barras vizinhas, e nunca mais grossa que 24px.
  const largBarra = Math.max(4, Math.min(24, fatia - 2));
  // Um rótulo de data pede uns 46px; se não couber, mostramos de N em N.
  const saltoRotulo = Math.max(1, Math.ceil((recPeriodos.length * 46) / plotL));
  const iMaior = recPeriodos.reduce((m, p, i) => (p.total > recPeriodos[m].total ? i : m), 0);

  recPeriodos.forEach((p, i) => {
    const centro = ESQ + fatia * i + fatia / 2;
    const altBarra = teto ? (p.total / teto) * plotA : 0;
    const y = TOPO + plotA - altBarra;

    let barra = null;
    if (p.total > 0) {
      barra = svgEl('path', {
        d: caminhoBarra(centro - largBarra / 2, y, largBarra, altBarra, 4),
        fill: COR_BARRA, class: 'barra-receb',
      });
      svg.appendChild(barra);
    }

    // Só o maior leva o valor escrito. Número em cima de toda barra vira ruído
    // e ninguém lê — o resto está no eixo, na dica e na tabela.
    if (i === iMaior && p.total > 0) {
      // Se a barra mais alta for a primeira ou a última, o rótulo centralizado
      // escaparia por cima dos números do eixo. Prendemos dentro do gráfico.
      const meiaLargura = p.total_formatado.length * 3.4;
      const x = Math.max(ESQ + meiaLargura, Math.min(centro, largura - DIR - meiaLargura));
      const t = svgEl('text', {
        x, y: y - 9, 'text-anchor': 'middle',
        fill: COR_TEXTO, 'font-size': 12, 'font-weight': 700,
      });
      t.textContent = p.total_formatado;
      svg.appendChild(t);
    }

    if (i % saltoRotulo === 0) {
      const t = svgEl('text', {
        x: centro, y: ALTURA - BASE + 20, 'text-anchor': 'middle',
        fill: COR_EIXO, 'font-size': 11, 'font-weight': 600,
      });
      t.textContent = p.rotulo;
      svg.appendChild(t);
    }

    // Alvo do mouse/teclado: a fatia inteira, não só os pixels pintados.
    const area = svgEl('rect', {
      x: ESQ + fatia * i, y: TOPO, width: fatia, height: plotA,
      fill: 'transparent', class: 'alvo-barra', tabindex: '0', role: 'img',
      'aria-label': `${p.rotulo_longo}: ${p.total_formatado}, ${p.pedidos} pedido(s).`,
    });
    // A barra clareia sob o cursor para o leitor ver que o gráfico respondeu.
    // Em JS, e não em CSS: o `+` do CSS pediria a barra depois do alvo, e aí
    // o alvo transparente ficaria por baixo e engoliria metade dos hovers.
    const abrir = () => {
      if (barra) barra.setAttribute('fill', COR_BARRA_CLARA);
      // Ancora na barra, não na fatia inteira: a dica tem que sair da ponta.
      mostrarDica(p, barra || area);
    };
    const fechar = () => {
      if (barra) barra.setAttribute('fill', COR_BARRA);
      esconderDica();
    };
    area.addEventListener('pointerenter', abrir);
    area.addEventListener('focus', abrir);
    area.addEventListener('pointerleave', fechar);
    area.addEventListener('blur', fechar);
    svg.appendChild(area);
  });

  alvo.appendChild(svg);
}

function preencherTabela(resumo) {
  const corpo = $('#rec-tabela');
  corpo.textContent = '';
  if (!recPeriodos.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 4;
    td.className = 'vazio';
    td.textContent = 'Nada entregue neste período.';
    tr.appendChild(td);
    corpo.appendChild(tr);
  }
  for (const p of recPeriodos) {
    const tr = document.createElement('tr');
    const celulas = [p.rotulo_longo, p.pedidos, p.doces, p.total_formatado];
    celulas.forEach((valor, i) => {
      const cel = document.createElement(i === 0 ? 'th' : 'td');
      if (i === 0) cel.scope = 'row'; else cel.className = 'num';
      cel.textContent = valor;
      tr.appendChild(cel);
    });
    if (!p.pedidos) tr.className = 'sem-movimento';
    corpo.appendChild(tr);
  }
  $('#rec-tot-pedidos').textContent = resumo.pedidos;
  $('#rec-tot-doces').textContent = resumo.doces;
  $('#rec-tot-valor').textContent = resumo.total_formatado;
}

async function carregarRecebimentos() {
  const minhaBusca = ++recBusca;
  const params = new URLSearchParams({ granularidade: recGran });
  const de = $('#rec-de').value;
  const ate = $('#rec-ate').value;
  if (de) params.set('de', de);
  if (ate) params.set('ate', ate);

  const area = $('.grafico-area');
  area.style.opacity = '.4'; // segura o desenho antigo em vez de piscar vazio

  let dados;
  try {
    dados = await api(`/admin/api/recebimentos?${params}`);
  } catch (erro) {
    if (minhaBusca !== recBusca) return;
    area.style.opacity = '';
    $('#rec-grafico').innerHTML = `<p class="vazio">${escapar(erro.message)}</p>`;
    return;
  }
  // Chegou atrasada: outro filtro já foi pedido depois desta. Descartamos.
  if (minhaBusca !== recBusca) return;
  area.style.opacity = '';

  recPeriodos = dados.periodos;
  const r = dados.resumo;
  $('#rec-total').textContent = r.total_formatado;
  $('#rec-pedidos').textContent = r.pedidos;
  $('#rec-ticket').textContent = r.ticket_formatado;
  $('#rec-melhor').textContent = r.melhor_formatado;
  $('#rec-melhor-rotulo').textContent = r.pedidos ? `Melhor: ${r.melhor_rotulo}` : 'Melhor período';
  $('#rec-titulo-grafico').textContent = `Recebido por ${NOME_GRAN[recGran]}`;

  esconderDica();
  desenharGrafico();
  preencherTabela(r);
}

function marcarAtivo(grupo, botao) {
  $$(`#${grupo} .filtro`).forEach((b) => b.classList.toggle('ativo', b === botao));
}

$('#rec-granularidade').addEventListener('click', (ev) => {
  const botao = ev.target.closest('.filtro');
  if (!botao) return;
  recGran = botao.dataset.gran;
  marcarAtivo('rec-granularidade', botao);
  carregarRecebimentos();
});

$('#rec-presets').addEventListener('click', (ev) => {
  const botao = ev.target.closest('.filtro');
  if (!botao) return;
  marcarAtivo('rec-presets', botao);
  const dias = Number(botao.dataset.dias);
  if (!dias) {
    $('#rec-de').value = '';
    $('#rec-ate').value = '';
  } else {
    const hoje = new Date();
    const inicio = new Date(hoje);
    inicio.setDate(inicio.getDate() - dias + 1);
    const iso = (d) => d.toLocaleDateString('sv-SE'); // 'sv-SE' dá YYYY-MM-DD local
    $('#rec-de').value = iso(inicio);
    $('#rec-ate').value = iso(hoje);
  }
  carregarRecebimentos();
});

['#rec-de', '#rec-ate'].forEach((sel) => {
  $(sel).addEventListener('change', () => {
    // Datas na mão desmarcam o atalho: senão a tela diz "Tudo" mostrando um mês.
    $$('#rec-presets .filtro').forEach((b) => b.classList.remove('ativo'));
    carregarRecebimentos();
  });
});

// A largura do gráfico vem do tamanho da tela, então redesenhamos ao girar o
// celular ou mudar a janela.
let redesenhar;
window.addEventListener('resize', () => {
  if ($('#aba-recebimentos').classList.contains('oculto')) return;
  clearTimeout(redesenhar);
  redesenhar = setTimeout(() => { esconderDica(); desenharGrafico(); }, 150);
});

/** Recarrega a aba que está aberta no momento. */
function recarregarAbaAtiva() {
  // Nunca no meio de um cadastro: puxar o tapete de quem está digitando é pior
  // do que o número ficar alguns segundos velho.
  if (!$('#modal-pedido').classList.contains('oculto')) return;
  if (!$('#modal-doce').classList.contains('oculto')) return;

  if (!$('#aba-recebimentos').classList.contains('oculto')) carregarRecebimentos();
  else if (!$('#aba-pedidos').classList.contains('oculto')) carregarPedidos();
}

carregarPedidos();
setInterval(() => { if (!document.hidden) recarregarAbaAtiva(); }, 30000);

// Voltar para a aba do navegador (ou para o app, no celular) revalida na hora.
// Sem isto, o painel deixado aberto no telefone mostrava os números de antes:
// a aba Recebimentos só buscava dados quando era clicada, então ela congelava.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) recarregarAbaAtiva();
});
