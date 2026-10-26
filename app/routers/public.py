from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import ItemPedido, Pedido, Produto
from app.schemas import PedidoIn, ProdutoOut
from app.templates_engine import templates
from app.whatsapp import brl, link_whatsapp

router = APIRouter()


@router.get("/", response_class=HTMLResponse)
def home(request: Request):
    minima = date.today() + timedelta(days=settings.antecedencia_dias)
    return templates.TemplateResponse(
        request,
        "index.html",
        {
            "loja_nome": settings.loja_nome,
            "data_minima": minima.isoformat(),
            "data_maxima": (date.today() + timedelta(days=180)).isoformat(),
        },
    )


@router.get("/api/produtos", response_model=list[ProdutoOut])
def listar_produtos(db: Session = Depends(get_db)):
    return db.scalars(
        select(Produto).where(Produto.ativo.is_(True)).order_by(Produto.ordem, Produto.id)
    ).all()


@router.post("/api/pedidos", status_code=201)
def criar_pedido(dados: PedidoIn, db: Session = Depends(get_db)):
    ids = [i.produto_id for i in dados.itens]
    produtos = {
        p.id: p
        for p in db.scalars(
            select(Produto).where(Produto.id.in_(ids), Produto.ativo.is_(True))
        ).all()
    }
    faltando = set(ids) - produtos.keys()
    if faltando:
        raise HTTPException(400, "Um dos doces escolhidos não está mais disponível.")

    pedido = Pedido(
        cliente_nome=dados.cliente_nome,
        cliente_telefone=dados.cliente_telefone,
        data_entrega=dados.data_entrega,
        modo=dados.modo,
        endereco=dados.endereco,
        observacoes=dados.observacoes,
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

    return {
        "pedido_id": pedido.id,
        "total": pedido.total,
        "total_formatado": brl(pedido.total),
        "whatsapp_url": link_whatsapp(pedido),
    }
