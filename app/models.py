from datetime import date, datetime, timezone

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

# Situações possíveis de um pedido.
PENDENTE = "pendente"
APROVADO = "aprovado"
RECUSADO = "recusado"
ENTREGUE = "entregue"

STATUS_LABEL = {
    PENDENTE: "Aguardando aprovação",
    APROVADO: "Aprovado",
    RECUSADO: "Recusado",
    ENTREGUE: "Entregue",
}

MODO_LABEL = {
    "retirada": "Cliente vai buscar",
    "entrega": "Entregar no endereço",
}


def agora() -> datetime:
    return datetime.now(timezone.utc)


class Produto(Base):
    __tablename__ = "produtos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    nome: Mapped[str] = mapped_column(String(80), nullable=False)
    descricao: Mapped[str] = mapped_column(String(200), default="")
    emoji: Mapped[str] = mapped_column(String(8), default="🍬")
    preco: Mapped[float] = mapped_column(Float, nullable=False)
    unidade: Mapped[str] = mapped_column(String(20), default="unidade")
    ativo: Mapped[bool] = mapped_column(Boolean, default=True)
    ordem: Mapped[int] = mapped_column(Integer, default=0)
    # Nome do arquivo em static/img/produtos. Vazio = mostra o emoji.
    foto: Mapped[str] = mapped_column(String(120), default="")

    @property
    def foto_url(self) -> str:
        return f"/static/img/produtos/{self.foto}" if self.foto else ""


class Pedido(Base):
    __tablename__ = "pedidos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    cliente_nome: Mapped[str] = mapped_column(String(80), nullable=False)
    cliente_telefone: Mapped[str] = mapped_column(String(20), nullable=False)
    data_entrega: Mapped[date] = mapped_column(Date, nullable=False)
    modo: Mapped[str] = mapped_column(String(10), nullable=False)
    endereco: Mapped[str] = mapped_column(Text, default="")
    observacoes: Mapped[str] = mapped_column(Text, default="")
    total: Mapped[float] = mapped_column(Float, default=0.0)
    status: Mapped[str] = mapped_column(String(12), default=PENDENTE, index=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime, default=agora)
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime, default=agora, onupdate=agora
    )

    itens: Mapped[list["ItemPedido"]] = relationship(
        back_populates="pedido",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    @property
    def status_label(self) -> str:
        return STATUS_LABEL.get(self.status, self.status)

    @property
    def modo_label(self) -> str:
        return MODO_LABEL.get(self.modo, self.modo)

    def resumo_itens(self) -> str:
        return " | ".join(f"{i.quantidade}x {i.produto_nome}" for i in self.itens)


class ItemPedido(Base):
    __tablename__ = "itens_pedido"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    pedido_id: Mapped[int] = mapped_column(
        ForeignKey("pedidos.id", ondelete="CASCADE"), index=True
    )
    produto_id: Mapped[int] = mapped_column(ForeignKey("produtos.id"))
    # Guardamos nome e preço no momento do pedido: se sua mãe reajustar o preço
    # depois, os pedidos antigos continuam mostrando o valor que foi cobrado.
    produto_nome: Mapped[str] = mapped_column(String(80), nullable=False)
    preco_unitario: Mapped[float] = mapped_column(Float, nullable=False)
    quantidade: Mapped[int] = mapped_column(Integer, nullable=False)

    pedido: Mapped[Pedido] = relationship(back_populates="itens")

    @property
    def subtotal(self) -> float:
        return round(self.preco_unitario * self.quantidade, 2)
