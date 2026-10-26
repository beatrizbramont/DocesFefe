// Loja de doces — montagem do carrinho e envio do pedido.

const $ = (sel) => document.querySelector(sel);

const estado = {
  produtos: [],
  quantidades: new Map(), // produto_id -> quantidade
  ultimoPedido: null,
  // O site não consegue ver o WhatsApp. O clique no botão verde é o único
  // sinal real de que a pessoa foi enviar a mensagem — é nele que a gente se baseia.
  abriuWhatsapp: false,
};

const brl = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// ------------------------------------------------------------- cardápio

async function carregarProdutos() {
  const alvo = $('#lista-produtos');
  try {
    const resp = await fetch('/api/produtos');
    if (!resp.ok) throw new Error();
    estado.produtos = await resp.json();
  } catch {
    alvo.innerHTML = '<p class="erro">Não conseguimos carregar o cardápio. Atualize a página.</p>';
    return;
  }

  if (!estado.produtos.length) {
    alvo.innerHTML = '<p class="vazio">Nenhum doce disponível no momento. 😢</p>';
    return;
  }

  alvo.innerHTML = '';
  for (const p of estado.produtos) {
    const card = document.createElement('article');
    card.className = 'produto';
    card.dataset.id = p.id;
    const visual = p.foto_url
      ? `<div class="produto-emoji tem-foto"><img src="${p.foto_url}" alt="" loading="lazy"></div>`
      : `<div class="produto-emoji">${p.emoji}</div>`;

    card.innerHTML = `
      ${visual}
      <div class="produto-info">
        <h3></h3>
        <p></p>
        <span class="produto-preco">${brl(p.preco)} <small>/ ${p.unidade}</small></span>
      </div>
      <div class="contador">
        <button type="button" data-acao="menos" aria-label="Diminuir" disabled>−</button>
        <input type="number" value="0" min="0" max="500" inputmode="numeric"
               aria-label="Quantidade">
        <button type="button" data-acao="mais" aria-label="Aumentar">+</button>
      </div>`;
    // textContent evita que nome/descrição vindos do banco virem HTML.
    card.querySelector('h3').textContent = p.nome;
    card.querySelector('.produto-info p').textContent = p.descricao;
    alvo.appendChild(card);
  }

  alvo.addEventListener('click', (ev) => {
    const botao = ev.target.closest('button[data-acao]');
    if (!botao) return;
    const card = botao.closest('.produto');
    const campo = card.querySelector('input');
    const passo = botao.dataset.acao === 'mais' ? 1 : -1;
    definirQuantidade(card, Number(campo.value) + passo);
  });

  alvo.addEventListener('input', (ev) => {
    if (ev.target.matches('input[type=number]')) {
      definirQuantidade(ev.target.closest('.produto'), Number(ev.target.value));
    }
  });
}

function definirQuantidade(card, valor) {
  const qtd = Math.max(0, Math.min(500, Math.floor(valor) || 0));
  const id = Number(card.dataset.id);

  card.querySelector('input').value = qtd;
  card.querySelector('[data-acao=menos]').disabled = qtd === 0;
  card.classList.toggle('escolhido', qtd > 0);

  if (qtd > 0) estado.quantidades.set(id, qtd);
  else estado.quantidades.delete(id);

  atualizarTotal();
}

function atualizarTotal() {
  let itens = 0;
  let total = 0;
  for (const [id, qtd] of estado.quantidades) {
    const produto = estado.produtos.find((p) => p.id === id);
    if (!produto) continue;
    itens += qtd;
    total += produto.preco * qtd;
  }

  $('#barra-itens').textContent = itens === 1 ? '1 item' : `${itens} itens`;
  $('#barra-valor').textContent = brl(total);
  $('#barra-total').classList.toggle('oculto', itens === 0);
  $('#btn-enviar').disabled = itens === 0;
  document.body.style.paddingBottom = itens === 0 ? '40px' : '110px';
}

// ------------------------------------------------------------- formulário

function mascararTelefone(valor) {
  const d = valor.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function configurarFormulario() {
  const { dataMinima, dataMaxima } = document.body.dataset;
  const campoData = $('#data');
  campoData.min = dataMinima;
  campoData.max = dataMaxima;

  const [ano, mes, dia] = dataMinima.split('-');
  $('#dica-data').textContent = `Precisamos de um tempinho para preparar: escolha a partir de ${dia}/${mes}/${ano}.`;

  $('#telefone').addEventListener('input', (ev) => {
    ev.target.value = mascararTelefone(ev.target.value);
  });

  for (const radio of document.querySelectorAll('input[name=modo]')) {
    radio.addEventListener('change', () => {
      const entrega = radio.value === 'entrega' && radio.checked;
      $('#campo-endereco').classList.toggle('oculto', !entrega);
      if (entrega) $('#endereco').focus();
    });
  }

  $('#btn-ir-dados').addEventListener('click', () => {
    $('#etapa-dados').scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => $('#nome').focus(), 400);
  });

  $('#form-pedido').addEventListener('submit', enviarPedido);
  $('#btn-novo-pedido').addEventListener('click', () => window.location.reload());
  $('#btn-fechar-sucesso').addEventListener('click', fecharSucesso);
  $('#btn-whatsapp').addEventListener('click', marcarComoEnviado);
  $('#aviso-pendente-link').addEventListener('click', () => {
    estado.abriuWhatsapp = true;
    fecharSucesso();
  });
  $('#modal-sucesso').addEventListener('click', (ev) => {
    if (ev.target.id === 'modal-sucesso') fecharSucesso();
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && !$('#modal-sucesso').classList.contains('oculto')) fecharSucesso();
  });
}

function mostrarErro(mensagem, campo) {
  const caixa = $('#erro-form');
  caixa.textContent = mensagem;
  caixa.hidden = false;
  caixa.scrollIntoView({ behavior: 'smooth', block: 'center' });
  if (campo) {
    campo.classList.add('invalido');
    campo.addEventListener('input', () => campo.classList.remove('invalido'), { once: true });
  }
}

async function enviarPedido(ev) {
  ev.preventDefault();
  $('#erro-form').hidden = true;

  const nome = $('#nome').value.trim();
  const telefone = $('#telefone').value.replace(/\D/g, '');
  const data = $('#data').value;
  const modo = document.querySelector('input[name=modo]:checked').value;
  const endereco = $('#endereco').value.trim();

  if (nome.length < 2) return mostrarErro('Escreva seu nome, por favor.', $('#nome'));
  if (telefone.length < 10) return mostrarErro('Telefone incompleto. Use DDD + número.', $('#telefone'));
  if (!data) return mostrarErro('Escolha a data em que quer receber os doces.', $('#data'));
  if (modo === 'entrega' && endereco.length < 10) {
    return mostrarErro('Para entrega, informe o endereço completo.', $('#endereco'));
  }

  const corpo = {
    cliente_nome: nome,
    cliente_telefone: telefone,
    data_entrega: data,
    modo,
    endereco: modo === 'entrega' ? endereco : '',
    observacoes: $('#obs').value.trim(),
    itens: [...estado.quantidades].map(([produto_id, quantidade]) => ({ produto_id, quantidade })),
  };

  const botao = $('#btn-enviar');
  botao.disabled = true;
  botao.textContent = 'Registrando pedido…';

  try {
    const resp = await fetch('/api/pedidos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    const dados = await resp.json();
    if (!resp.ok) throw new Error(dados.detail || 'Não foi possível registrar o pedido.');

    mostrarSucesso(dados);
  } catch (erro) {
    mostrarErro(erro.message);
    botao.disabled = false;
    botao.textContent = 'Enviar pedido pelo WhatsApp';
  }
}

function mostrarSucesso(dados) {
  // Não abrimos o WhatsApp sozinhos: navegador de celular bloqueia pop-up que
  // não veio de um toque direto. O botão verde é o caminho confiável.
  estado.ultimoPedido = dados;
  estado.abriuWhatsapp = false;
  $('#modal-resumo').textContent =
    `Pedido nº ${dados.pedido_id} · Total ${dados.total_formatado}`;
  $('#btn-whatsapp').href = dados.whatsapp_url;
  $('#modal-sucesso').classList.remove('oculto');
  $('#barra-total').classList.add('oculto');
}

/** Chamado quando a pessoa toca no botão verde e o WhatsApp abre. */
function marcarComoEnviado() {
  estado.abriuWhatsapp = true;
  $('#ms-emoji').textContent = '✅';
  $('#ms-titulo').textContent = 'Tudo certo!';
  $('#ms-selo').textContent = '⏳ Aguardando nossa confirmação';
  $('#ms-texto').innerHTML =
    'Abrimos a conversa no WhatsApp. Depois de enviar a mensagem, ' +
    '<strong>é só aguardar</strong> — respondemos confirmando a data.';
  $('#btn-whatsapp').textContent = 'Abrir a conversa de novo';
}

function fecharSucesso() {
  $('#modal-sucesso').classList.add('oculto');
  const pedido = estado.ultimoPedido;
  if (!pedido) return;

  const aviso = $('#aviso-pendente');
  if (estado.abriuWhatsapp) {
    aviso.classList.add('enviado');
    $('#aviso-pendente-texto').textContent =
      `✅ Pedido nº ${pedido.pedido_id} enviado. Aguarde nossa confirmação.`;
    $('#aviso-pendente-link').textContent = 'Abrir conversa';
  } else {
    // Só afirmamos "não enviado" quando a pessoa nem chegou a abrir o WhatsApp.
    aviso.classList.remove('enviado');
    $('#aviso-pendente-texto').textContent =
      `⏳ Pedido nº ${pedido.pedido_id} registrado, mas você ainda não abriu o WhatsApp.`;
    $('#aviso-pendente-link').textContent = 'Enviar agora';
  }
  $('#aviso-pendente-link').href = pedido.whatsapp_url;
  aviso.classList.remove('oculto');
}

carregarProdutos();
configurarFormulario();
