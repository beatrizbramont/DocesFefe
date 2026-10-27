import secrets
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import fotos
from app.config import EXPORTS_DIR, settings
from app.database import get_db
from app.models import (
    APROVADO,
    ENTREGUE,
    PENDENTE,
    RECUSADO,
    ItemPedido,
    Pedido,
    Produto,
)
from app.planilha import gerar_planilha
from app.schemas import PedidoEditIn, PedidoNovoIn, ProdutoIn
from app.templates_engine import templates
from app.whatsapp import brl, telefone_formatado

router = APIRouter(prefix="/admin")

STATUS_VALIDOS = {PENDENTE, APROVADO, RECUSADO, ENTREGUE}


def logado(request: Request) -> bool:
    return bool(request.session.get("admin"))


def exigir_login(request: Request) -> None:
    """Dependência das rotas de API do painel."""
    if not logado(request):
        raise HTTPException(401, "Sessão expirada. Faça login novamente.")


def _todos_pedidos(db: Session) -> list[Pedido]:
    return list(db.scalars(select(Pedido).order_by(Pedido.data_entrega, Pedido.id)).all())


def _regerar_planilha(db: Session) -> None:
    """Chamado a cada mudança de situação, para a planilha nunca ficar velha."""
    gerar_planilha(_todos_pedidos(db))


# ----------------------------------------------------------------- login

@router.get("/login", response_class=HTMLResponse)
def tela_login(request: Request, erro: str = ""):
    if logado(request):
        return RedirectResponse("/admin", status_code=303)
    return templates.TemplateResponse(
        request, "login.html", {"loja_nome": settings.loja_nome, "erro": erro}
    )


@router.post("/login")
def fazer_login(request: Request, senha: str = Form(...)):
    if not secrets.compare_digest(senha, settings.admin_senha):
        return RedirectResponse("/admin/login?erro=1", status_code=303)
    request.session["admin"] = True
    return RedirectResponse("/admin", status_code=303)


@router.get("/sair")
def sair(request: Request):
    request.session.clear()
    return RedirectResponse("/admin/login", status_code=303)


# ----------------------------------------------------------------- painel

@router.get("", response_class=HTMLResponse)
def painel(request: Request):
    if not logado(request):
        return RedirectResponse("/admin/login", status_code=303)
    # Mostramos o número que está valendo AGORA na tela: o .env só é lido quando
    # o servidor liga, e já aconteceu de editar o arquivo e não perceber que o
    # site continuava com o número antigo.
    numero = settings.whatsapp_limpo
    return templates.TemplateResponse(
        request,
        "admin.html",
        {
            "loja_nome": settings.loja_nome,
            "whatsapp_ativo": telefone_formatado(numero.removeprefix("55")),
        },
    )


@router.get("/api/pedidos", dependencies=[Depends(exigir_login)])
def listar_pedidos(status: str = "abertos", db: Session = Depends(get_db)):
    consulta = select(Pedido).order_by(Pedido.data_entrega, Pedido.id)
    if status == "abertos":
        # O que ainda dá trabalho: entregue e recusado saem da frente.
        consulta = consulta.where(Pedido.status.in_([PENDENTE, APROVADO]))
    elif status in STATUS_VALIDOS:
        consulta = consulta.where(Pedido.status == status)

    pedidos = db.scalars(consulta).all()
    hoje = date.today()
    return {
        "resumo": _resumo(db),
        "pedidos": [
            {
                "id": p.id,
                "cliente_nome": p.cliente_nome,
                "telefone": telefone_formatado(p.cliente_telefone),
                "telefone_bruto": p.cliente_telefone,
                "data_entrega": p.data_entrega.strftime("%d/%m/%Y"),
                "dias_restantes": (p.data_entrega - hoje).days,
                "modo": p.modo,
                "modo_label": p.modo_label,
                "endereco": p.endereco,
                "observacoes": p.observacoes,
                "status": p.status,
                "status_label": p.status_label,
                "total_formatado": brl(p.total),
                "criado_em": p.criado_em.strftime("%d/%m/%Y %H:%M"),
                "data_entrega_iso": p.data_entrega.isoformat(),
                "itens": [
                    {
                        "produto_id": i.produto_id,
                        "nome": i.produto_nome,
                        "quantidade": i.quantidade,
                        "preco_unitario": i.preco_unitario,
                        "subtotal_formatado": brl(i.subtotal),
                    }
                    for i in p.itens
                ],
            }
            for p in pedidos
        ],
    }


def _resumo(db: Session) -> dict:
    pedidos = _todos_pedidos(db)
    hoje = date.today()
    a_entregar = [p for p in pedidos if p.status == APROVADO and p.data_entrega >= hoje]
    return {
        "pendentes": sum(1 for p in pedidos if p.status == PENDENTE),
        "aprovados": sum(1 for p in pedidos if p.status == APROVADO),
        "a_entregar": len(a_entregar),
        "faturamento_previsto": brl(round(sum(p.total for p in a_entregar), 2)),
    }


@router.post("/api/pedidos/{pedido_id}/status", dependencies=[Depends(exigir_login)])
def mudar_status(pedido_id: int, payload: dict, db: Session = Depends(get_db)):
    novo = payload.get("status", "")
    if novo not in STATUS_VALIDOS:
        raise HTTPException(400, "Situação inválida.")

    pedido = db.get(Pedido, pedido_id)
    if not pedido:
        raise HTTPException(404, "Pedido não encontrado.")

    pedido.status = novo
    db.commit()
    _regerar_planilha(db)
    return {"ok": True, "status": novo, "resumo": _resumo(db)}


@router.post("/api/pedidos", dependencies=[Depends(exigir_login)], status_code=201)
def criar_pedido_manual(dados: PedidoNovoIn, db: Session = Depends(get_db)):
    """Pedido combinado por fora do site (WhatsApp, pessoalmente, na feira).

    Preço usado é o de hoje, e a planilha é regerada igual às outras ações.
    """
    ids = [i.produto_id for i in dados.itens]
    produtos = {
        p.id: p for p in db.scalars(select(Produto).where(Produto.id.in_(ids))).all()
    }
    if set(ids) - produtos.keys():
        raise HTTPException(400, "Um dos doces escolhidos não existe mais.")

    pedido = Pedido(
        cliente_nome=dados.cliente_nome,
        cliente_telefone=dados.cliente_telefone,
        data_entrega=dados.data_entrega,
        modo=dados.modo,
        endereco=dados.endereco,
        observacoes=dados.observacoes,
        status=dados.status,
    )
    for item in dados.itens:
        produto = produtos[item.produto_id]
        pedido.itens.append(
            ItemPedido(
                produto_id=produto.id,
                produto_nome=produto.nome,
                preco_unitario=produto.preco,
                quantidade=item.quantidade,
            )
        )
    pedido.total = round(sum(i.subtotal for i in pedido.itens), 2)

    db.add(pedido)
    db.commit()
    db.refresh(pedido)
    _regerar_planilha(db)
    return {"ok": True, "id": pedido.id, "resumo": _resumo(db)}


@router.put("/api/pedidos/{pedido_id}", dependencies=[Depends(exigir_login)])
def editar_pedido(pedido_id: int, dados: PedidoEditIn, db: Session = Depends(get_db)):
    """Corrige um pedido: quantidades, doces, data, forma de entrega e observações."""
    pedido = db.get(Pedido, pedido_id)
    if not pedido:
        raise HTTPException(404, "Pedido não encontrado.")

    ids = [i.produto_id for i in dados.itens]
    produtos = {
        p.id: p for p in db.scalars(select(Produto).where(Produto.id.in_(ids))).all()
    }
    if set(ids) - produtos.keys():
        raise HTTPException(400, "Um dos doces escolhidos não existe mais.")

    # Preço já cobrado continua valendo; doce novo entra pelo preço de hoje.
    precos_antigos = {i.produto_id: i.preco_unitario for i in pedido.itens}

    pedido.itens.clear()
    db.flush()
    for item in dados.itens:
        produto = produtos[item.produto_id]
        pedido.itens.append(
            ItemPedido(
                produto_id=produto.id,
                produto_nome=produto.nome,
                preco_unitario=precos_antigos.get(produto.id, produto.preco),
                quantidade=item.quantidade,
            )
        )

    pedido.cliente_nome = dados.cliente_nome
    pedido.cliente_telefone = dados.cliente_telefone
    pedido.data_entrega = dados.data_entrega
    pedido.modo = dados.modo
    pedido.endereco = dados.endereco
    pedido.observacoes = dados.observacoes
    pedido.total = round(sum(i.subtotal for i in pedido.itens), 2)

    db.commit()
    _regerar_planilha(db)
    return {"ok": True, "total_formatado": brl(pedido.total), "resumo": _resumo(db)}


@router.delete("/api/pedidos/{pedido_id}", dependencies=[Depends(exigir_login)])
def excluir_pedido(pedido_id: int, db: Session = Depends(get_db)):
    pedido = db.get(Pedido, pedido_id)
    if not pedido:
        raise HTTPException(404, "Pedido não encontrado.")
    db.delete(pedido)
    db.commit()
    _regerar_planilha(db)
    return {"ok": True, "resumo": _resumo(db)}


# ----------------------------------------------------------------- recebimentos

GRANULARIDADES = ("dia", "mes", "ano")
MES_CURTO = ("jan", "fev", "mar", "abr", "mai", "jun",
             "jul", "ago", "set", "out", "nov", "dez")
MES_LONGO = ("janeiro", "fevereiro", "março", "abril", "maio", "junho",
             "julho", "agosto", "setembro", "outubro", "novembro", "dezembro")


def _inicio_do_periodo(d: date, gran: str) -> date:
    if gran == "ano":
        return date(d.year, 1, 1)
    if gran == "mes":
        return date(d.year, d.month, 1)
    return d


def _periodo_seguinte(d: date, gran: str) -> date:
    if gran == "ano":
        return date(d.year + 1, 1, 1)
    if gran == "mes":
        return date(d.year + 1, 1, 1) if d.month == 12 else date(d.year, d.month + 1, 1)
    return d + timedelta(days=1)


def _rotulos(d: date, gran: str) -> tuple[str, str]:
    """(curto para o eixo do gráfico, longo para a tabela)"""
    if gran == "ano":
        return str(d.year), str(d.year)
    if gran == "mes":
        return f"{MES_CURTO[d.month - 1]}/{str(d.year)[2:]}", f"{MES_LONGO[d.month - 1]} de {d.year}"
    return d.strftime("%d/%m"), d.strftime("%d/%m/%Y")


def _data_ou_nada(texto: str) -> date | None:
    try:
        return date.fromisoformat(texto) if texto else None
    except ValueError:
        raise HTTPException(400, "Data do filtro inválida.") from None


@router.get("/api/recebimentos", dependencies=[Depends(exigir_login)])
def recebimentos(
    granularidade: str = "mes",
    de: str = "",
    ate: str = "",
    db: Session = Depends(get_db),
):
    """Quanto entrou, agrupado por dia / mês / ano.

    Conta só o que já foi **entregue** — aprovado ainda pode furar — e joga o
    valor na **data da entrega**, que é quando o doce saiu e o dinheiro entrou.
    """
    if granularidade not in GRANULARIDADES:
        raise HTTPException(400, "Agrupamento inválido.")

    inicio, fim = _data_ou_nada(de), _data_ou_nada(ate)
    if inicio and fim and inicio > fim:
        inicio, fim = fim, inicio

    consulta = select(Pedido).where(Pedido.status == ENTREGUE)
    if inicio:
        consulta = consulta.where(Pedido.data_entrega >= inicio)
    if fim:
        consulta = consulta.where(Pedido.data_entrega <= fim)
    pedidos = list(db.scalars(consulta.order_by(Pedido.data_entrega)).all())

    # Soma por período.
    baldes: dict[date, dict] = {}
    for p in pedidos:
        chave = _inicio_do_periodo(p.data_entrega, granularidade)
        balde = baldes.setdefault(chave, {"total": 0.0, "pedidos": 0, "doces": 0})
        balde["total"] += p.total
        balde["pedidos"] += 1
        balde["doces"] += sum(i.quantidade for i in p.itens)

    # Períodos sem nenhuma entrega entram zerados, senão o gráfico mente: dois
    # meses vizinhos no eixo podem estar a um ano de distância.
    periodos = []
    if baldes:
        cursor = min(baldes)
        ultimo = max(baldes)
        # Em "por dia" um intervalo longo viraria centenas de barras vazias.
        preencher = granularidade != "dia" or (ultimo - cursor).days <= 92
        while cursor <= ultimo:
            dados = baldes.get(cursor)
            if dados or preencher:
                dados = dados or {"total": 0.0, "pedidos": 0, "doces": 0}
                curto, longo = _rotulos(cursor, granularidade)
                periodos.append(
                    {
                        "chave": cursor.isoformat(),
                        "rotulo": curto,
                        "rotulo_longo": longo,
                        "total": round(dados["total"], 2),
                        "total_formatado": brl(round(dados["total"], 2)),
                        "pedidos": dados["pedidos"],
                        "doces": dados["doces"],
                    }
                )
            cursor = _periodo_seguinte(cursor, granularidade)

    total = round(sum(p.total for p in pedidos), 2)
    com_valor = [p for p in periodos if p["pedidos"]]
    melhor = max(com_valor, key=lambda p: p["total"], default=None)

    return {
        "granularidade": granularidade,
        "periodos": periodos,
        "resumo": {
            "total": total,
            "total_formatado": brl(total),
            "pedidos": len(pedidos),
            "doces": sum(sum(i.quantidade for i in p.itens) for p in pedidos),
            "ticket_formatado": brl(round(total / len(pedidos), 2)) if pedidos else brl(0),
            "melhor_rotulo": melhor["rotulo_longo"] if melhor else "—",
            "melhor_formatado": melhor["total_formatado"] if melhor else brl(0),
        },
    }


# ----------------------------------------------------------------- planilha

@router.get("/planilha")
def baixar_planilha(request: Request, db: Session = Depends(get_db)):
    if not logado(request):
        return RedirectResponse("/admin/login", status_code=303)

    destino = EXPORTS_DIR / "pedidos.xlsx"
    gerar_planilha(_todos_pedidos(db), destino)
    nome = f"pedidos-{settings.loja_nome.lower().replace(' ', '-')}-{datetime.now():%Y-%m-%d}.xlsx"
    return FileResponse(
        destino,
        filename=nome,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


# ----------------------------------------------------------------- produtos

@router.get("/api/produtos", dependencies=[Depends(exigir_login)])
def listar_produtos_admin(db: Session = Depends(get_db)):
    produtos = db.scalars(select(Produto).order_by(Produto.ordem, Produto.id)).all()
    return [
        {
            "id": p.id,
            "nome": p.nome,
            "descricao": p.descricao,
            "emoji": p.emoji,
            "preco": p.preco,
            "unidade": p.unidade,
            "ativo": p.ativo,
            "foto_url": p.foto_url,
        }
        for p in produtos
    ]


@router.post("/api/produtos", dependencies=[Depends(exigir_login)], status_code=201)
def criar_produto(dados: ProdutoIn, db: Session = Depends(get_db)):
    ultimo = db.scalar(select(Produto.ordem).order_by(Produto.ordem.desc()).limit(1)) or 0
    produto = Produto(**dados.model_dump(), ordem=ultimo + 1)
    db.add(produto)
    db.commit()
    return {"ok": True, "id": produto.id}


@router.put("/api/produtos/{produto_id}", dependencies=[Depends(exigir_login)])
def editar_produto(produto_id: int, dados: ProdutoIn, db: Session = Depends(get_db)):
    produto = db.get(Produto, produto_id)
    if not produto:
        raise HTTPException(404, "Doce não encontrado.")
    for campo, valor in dados.model_dump().items():
        setattr(produto, campo, valor)
    db.commit()
    return {"ok": True}


@router.delete("/api/produtos/{produto_id}", dependencies=[Depends(exigir_login)])
def desativar_produto(produto_id: int, db: Session = Depends(get_db)):
    """Não apagamos de verdade: pedidos antigos ainda apontam para esse doce."""
    produto = db.get(Produto, produto_id)
    if not produto:
        raise HTTPException(404, "Doce não encontrado.")
    produto.ativo = False
    db.commit()
    return {"ok": True}


@router.post("/api/produtos/{produto_id}/foto", dependencies=[Depends(exigir_login)])
async def enviar_foto(
    produto_id: int,
    arquivo: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    produto = db.get(Produto, produto_id)
    if not produto:
        raise HTTPException(404, "Doce não encontrado.")

    nome = fotos.salvar(await arquivo.read(), produto_id)
    fotos.apagar(produto.foto)  # só depois de a nova dar certo
    produto.foto = nome
    db.commit()
    return {"ok": True, "foto_url": produto.foto_url}


@router.delete("/api/produtos/{produto_id}/foto", dependencies=[Depends(exigir_login)])
def remover_foto(produto_id: int, db: Session = Depends(get_db)):
    produto = db.get(Produto, produto_id)
    if not produto:
        raise HTTPException(404, "Doce não encontrado.")
    fotos.apagar(produto.foto)
    produto.foto = ""
    db.commit()
    return {"ok": True}
