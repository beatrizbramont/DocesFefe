"""Leva o banco local (docesfefe.db) para o Postgres do Supabase.

Rode UMA vez, depois de colar a DATABASE_URL no .env e ANTES de ligar o site
com ela, para o cardápio inicial não ser criado lá e duplicar com o daqui:

    .\\.venv\\Scripts\\python.exe migrar_para_supabase.py

Se o banco de destino já tiver qualquer coisa dentro, o script para sem gravar
nada — é melhor reclamar do que misturar dois cardápios.
"""

import sys

from sqlalchemy import create_engine, func, inspect, select, text
from sqlalchemy.orm import Session

from app.database import DB_PATH, URL_BANCO, Base
from app.database import engine as destino
from app.models import ItemPedido, Pedido, Produto

# A ordem importa: item_pedido aponta para pedido e para produto.
MODELOS = (Produto, Pedido, ItemPedido)


def clonar(obj, Modelo):
    """Cópia com o mesmo id, para os pedidos continuarem apontando certo."""
    colunas = {c.key: getattr(obj, c.key) for c in inspect(Modelo).mapper.column_attrs}
    return Modelo(**colunas)


def main() -> int:
    if URL_BANCO.startswith("sqlite"):
        print("A DATABASE_URL do .env está vazia — não há para onde migrar.")
        print("Cole a connection string do Supabase no .env e rode de novo.")
        return 1

    if not DB_PATH.exists():
        print(f"Não achei o banco local em {DB_PATH}. Nada para migrar.")
        return 1

    origem = create_engine(f"sqlite:///{DB_PATH}")
    print("Criando as tabelas no Supabase (se ainda não existirem)...")
    Base.metadata.create_all(destino)

    with Session(origem) as lendo, Session(destino) as gravando:
        for Modelo in MODELOS:
            quantos = gravando.scalar(select(func.count()).select_from(Modelo))
            if quantos:
                print(
                    f"ABORTADO: o Supabase já tem {quantos} registro(s) em "
                    f"'{Modelo.__tablename__}'. Esvazie a tabela lá ou use outro "
                    "projeto antes de migrar."
                )
                return 1

        total = {}
        for Modelo in MODELOS:
            linhas = lendo.scalars(select(Modelo).order_by(Modelo.id)).all()
            for linha in linhas:
                gravando.add(clonar(linha, Modelo))
            gravando.flush()
            total[Modelo.__tablename__] = len(linhas)

        # Inserimos os ids na mão, então o contador do Postgres continua no 1 e
        # o primeiro pedido novo colidiria. Empurramos o contador para o fim.
        for Modelo in MODELOS:
            tabela = Modelo.__tablename__
            gravando.execute(
                text(
                    f"SELECT setval(pg_get_serial_sequence('{tabela}', 'id'), "
                    f"COALESCE((SELECT MAX(id) FROM {tabela}), 1))"
                )
            )

        # Trava de seguranca. Se a "API de Dados" do projeto estiver ligada, o
        # Supabase publica as tabelas do schema public numa API REST aberta, e
        # tabela criada por fora do painel nao vem com essa trava. Sem isto,
        # nome, telefone e endereco dos clientes ficariam acessiveis a quem
        # tivesse a chave publica do projeto. Nao atrapalha o site: quem conecta
        # pela DATABASE_URL e o dono das tabelas, e dono passa pela trava.
        for Modelo in MODELOS:
            gravando.execute(
                text(f"ALTER TABLE {Modelo.__tablename__} ENABLE ROW LEVEL SECURITY")
            )

        gravando.commit()

    print("\nPronto! Foi para o Supabase:")
    for tabela, quantos in total.items():
        print(f"  {quantos:>4} em {tabela}")
    print("\nAs tabelas ficaram com Row Level Security ligada (os dados dos")
    print("clientes nao ficam expostos na API publica do projeto).")
    print("\nPode ligar o site normalmente (.\\iniciar.ps1).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
