"""Ajustes de banco para quem já tinha o site rodando antes de uma mudança.

SQLAlchemy cria as tabelas que faltam, mas não acrescenta colunas novas em
tabelas que já existem. Aqui a gente faz isso na mão, na subida do servidor.
"""

from sqlalchemy import inspect, text

from app.database import engine

# (tabela, coluna, definição SQL)
COLUNAS_NOVAS = [
    ("produtos", "foto", "VARCHAR(120) NOT NULL DEFAULT ''"),
]


def aplicar() -> None:
    # Pelo inspector, e não por PRAGMA: o PRAGMA só existe no SQLite e isto
    # também roda no Postgres do Supabase.
    inspetor = inspect(engine)
    tabelas = set(inspetor.get_table_names())

    with engine.begin() as conn:
        for tabela, coluna, definicao in COLUNAS_NOVAS:
            if tabela not in tabelas:  # create_all cuida dela
                continue
            existentes = {c["name"] for c in inspetor.get_columns(tabela)}
            if coluna not in existentes:
                conn.execute(text(f"ALTER TABLE {tabela} ADD COLUMN {coluna} {definicao}"))
