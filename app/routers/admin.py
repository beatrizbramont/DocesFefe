import secrets
from datetime import date, datetime

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
from app.schemas import PedidoEditIn, ProdutoIn
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
