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
  if (alvo === 'doces') carregarDoces();
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

  const zap = `https://wa.me/55${p.telefone_bruto.replace(/^55/, '')}`;

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
        <div><b>Telefone</b><span>${p.telefone}</span></div>
        ${linhaObs}
      </div>

      <div class="pedido-itens">
        ${itens}
        <div class="total-linha"><span>Total</span><span>${p.total_formatado}</span></div>
      </div>

      <div class="pedido-botoes">
        ${botoes}
        <button class="btn-acao editar" data-id="${p.id}" data-editar="1">✏ Editar</button>
        <a class="btn-acao zap" href="${zap}" target="_blank" rel="noopener">💬 Falar com o cliente</a>
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

// --------------------------------------------------- editar pedido

async function abrirEdicaoPedido(id) {
  pedidoEditando = window.__pedidos[id];
  if (!produtosCache.length) produtosCache = await api('/admin/api/produtos');

  $('#ep-id').value = id;
  $('#ep-data').value = pedidoEditando.data_entrega_iso;
  $('#ep-obs').value = pedidoEditando.observacoes;
  $('#ep-endereco').value = pedidoEditando.endereco;
  $('#ep-erro').hidden = true;

  const radio = document.querySelector(`input[name=ep-modo][value="${pedidoEditando.modo}"]`);
  radio.checked = true;
  $('#ep-campo-endereco').classList.toggle('oculto', pedidoEditando.modo !== 'entrega');

  // Doces já no pedido (mesmo que desativados) + todos os que estão à venda.
  const noPedido = new Map(pedidoEditando.itens.map((i) => [i.produto_id, i]));
  const linhas = [...produtosCache]
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
    });

  $('#ep-itens').innerHTML = linhas.join('');
  recalcularEdicao();
  abrirModal('modal-pedido');
}

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

  const modo = document.querySelector('input[name=ep-modo]:checked').value;
  try {
    await api(`/admin/api/pedidos/${$('#ep-id').value}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data_entrega: $('#ep-data').value,
        modo,
        endereco: modo === 'entrega' ? $('#ep-endereco').value.trim() : '',
        observacoes: $('#ep-obs').value.trim(),
        itens,
      }),
    });
    fecharModal('modal-pedido');
    await carregarPedidos();
  } catch (e) {
    erro.textContent = e.message;
    erro.hidden = false;
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

carregarPedidos();
setInterval(() => {
  if (!document.hidden && $('#modal-pedido').classList.contains('oculto')) carregarPedidos();
}, 30000);
