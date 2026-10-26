"""Ajustes de banco para quem já tinha o site rodando antes de uma mudança.

SQLAlchemy cria as tabelas que faltam, mas não acrescenta colunas novas em
tabelas que já existem. Aqui a gente faz isso na mão, na subida do servidor.
"""

from sqlalchemy import text

from app.database import engine

# (tabela, coluna, definição SQL)
COLUNAS_NOVAS = [
    ("produtos", "foto", "VARCHAR(120) NOT NULL DEFAULT ''"),
]


def aplicar() -> None:
    with engine.begin() as conn:
        for tabela, coluna, definicao in COLUNAS_NOVAS:
            existentes = {
                linha[1] for linha in conn.execute(text(f"PRAGMA table_info({tabela})"))
            }
            if not existentes:  # tabela ainda não existe; create_all cuida dela
                continue
            if coluna not in existentes:
                conn.execute(text(f"ALTER TABLE {tabela} ADD COLUMN {coluna} {definicao}"))
