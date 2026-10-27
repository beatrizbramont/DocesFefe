"""Cadastro inicial dos doces — roda só na primeira vez que o site sobe.

Depois disso edite tudo pelo painel /admin, não precisa mexer aqui.
"""

from sqlalchemy import select

from app.database import SessionLocal
from app.models import Produto

PRODUTOS_INICIAIS = [
    {
        "nome": "Pão de mel",
        "descricao": "Massa fofinha de mel com recheio de doce de leite, coberto de chocolate.",
        "emoji": "🍯",
        "preco": 8.00,
        "unidade": "unidade",
        "ordem": 1,
    },
    {
        "nome": "Alfajor",
        "descricao": "Dois discos amanteigados com doce de leite e banho de chocolate.",
        "emoji": "🍪",
        "preco": 7.50,
        "unidade": "unidade",
        "ordem": 2,
    },
    {
        "nome": "Brownie",
        "descricao": "Chocolate meio amargo, casquinha crocante e meio cremoso por dentro.",
        "emoji": "🍫",
        "preco": 9.00,
        "unidade": "unidade",
        "ordem": 3,
    },
]


def popular_produtos() -> None:
    with SessionLocal() as db:
        if db.scalar(select(Produto).limit(1)):
            return
        db.add_all(Produto(**p) for p in PRODUTOS_INICIAIS)
        db.commit()
