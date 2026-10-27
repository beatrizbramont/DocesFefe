import re
from collections.abc import Generator
from urllib.parse import quote

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import BASE_DIR, settings

DB_PATH = BASE_DIR / "docesfefe.db"


JA_CODIFICADO = re.compile(r"%[0-9A-Fa-f]{2}")


def arrumar_credenciais(resto: str) -> str:
    """Conserta os dois tropeços de quem copia a conexão do painel do Supabase.

    1. A senha vem entre colchetes, porque o painel mostra `[YOUR-PASSWORD]` e
       é fácil trocar só o miolo e deixar os colchetes.
    2. A senha tem `@`, `#` ou `/`, que são separadores dentro de um endereço.
       Uma senha como `aa@bb@cc` partiria o endereço no lugar errado.

    `resto` é o pedaço depois do `://`: "usuario:senha@servidor:porta/banco".
    """
    if "@" not in resto:
        return resto
    # O último @ é o que separa de verdade: senha pode ter @, servidor não.
    credenciais, _, servidor = resto.rpartition("@")
    usuario, tem_senha, senha = credenciais.partition(":")
    if not tem_senha:
        return resto

    senha = senha.strip()
    if senha.startswith("[") and senha.endswith("]"):
        senha = senha[1:-1]
    # Se já veio escrita com %40 e afins, codificar de novo estragaria.
    if not JA_CODIFICADO.search(senha):
        senha = quote(senha, safe="")
    return f"{quote(usuario, safe='')}:{senha}@{servidor}"


def url_do_banco() -> str:
    """Postgres/Supabase se o .env mandar; senão, o arquivo local de sempre."""
    bruta = settings.database_url.strip()
    if not bruta:
        return f"sqlite:///{DB_PATH}"
    # O Supabase copia a string como "postgresql://..."; o driver que usamos
    # (psycopg 3) precisa do nome completo para o SQLAlchemy não procurar o
    # psycopg2, que não está instalado.
    for prefixo in ("postgresql://", "postgres://"):
        if bruta.startswith(prefixo):
            return "postgresql+psycopg://" + arrumar_credenciais(bruta[len(prefixo) :])
    return bruta


URL_BANCO = url_do_banco()
USANDO_SQLITE = URL_BANCO.startswith("sqlite")

engine = create_engine(
    URL_BANCO,
    connect_args={"check_same_thread": False} if USANDO_SQLITE else {},
    # O pooler do Supabase derruba conexão parada. Sem isso, o painel dá erro
    # na primeira ação depois de um tempo sem uso.
    pool_pre_ping=not USANDO_SQLITE,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
