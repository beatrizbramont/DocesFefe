from datetime import date, timedelta
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.config import settings


class ItemIn(BaseModel):
    produto_id: int
    quantidade: int = Field(ge=1, le=500)


class PedidoIn(BaseModel):
    cliente_nome: str = Field(min_length=2, max_length=80)
    cliente_telefone: str = Field(min_length=8, max_length=20)
    data_entrega: date
    modo: Literal["retirada", "entrega"]
    endereco: str = Field(default="", max_length=300)
    observacoes: str = Field(default="", max_length=300)
    itens: list[ItemIn] = Field(min_length=1)

    @field_validator("cliente_nome", "endereco", "observacoes")
    @classmethod
    def sem_espacos_sobrando(cls, v: str) -> str:
        return v.strip()

    @field_validator("cliente_telefone")
    @classmethod
    def telefone_valido(cls, v: str) -> str:
        digitos = "".join(c for c in v if c.isdigit())
        if not 10 <= len(digitos) <= 13:
            raise ValueError("Telefone inválido. Use DDD + número, ex.: (11) 98765-4321")
        return digitos

    @field_validator("data_entrega")
    @classmethod
    def data_com_antecedencia(cls, v: date) -> date:
        minima = date.today() + timedelta(days=settings.antecedencia_dias)
        if v < minima:
            raise ValueError(
                f"Encomendas precisam de {settings.antecedencia_dias} dia(s) de "
                f"antecedência. Escolha a partir de {minima.strftime('%d/%m/%Y')}."
            )
        if v > date.today() + timedelta(days=365):
            raise ValueError("Essa data está muito distante.")
        return v

    @model_validator(mode="after")
    def endereco_obrigatorio_na_entrega(self) -> "PedidoIn":
        if self.modo == "entrega" and len(self.endereco) < 10:
            raise ValueError(
                "Para entrega, informe o endereço completo (rua, número e bairro)."
            )
        if self.modo == "retirada":
            self.endereco = ""
        # Um mesmo produto não pode aparecer duas vezes no carrinho.
        ids = [i.produto_id for i in self.itens]
        if len(ids) != len(set(ids)):
            raise ValueError("Produto repetido no pedido.")
        return self


class PedidoEditIn(BaseModel):
    """Edição feita pela dona da loja no painel.

    Diferente do pedido do cliente, aqui NÃO exigimos antecedência: ela pode
    precisar corrigir um pedido para hoje, ou registrar algo combinado por fora.
    """

    cliente_nome: str = Field(min_length=2, max_length=80)
    # Opcional: venda de balcão nem sempre tem telefone para anotar.
    cliente_telefone: str = Field(default="", max_length=20)
    data_entrega: date
    modo: Literal["retirada", "entrega"]
    endereco: str = Field(default="", max_length=300)
    observacoes: str = Field(default="", max_length=300)
    itens: list[ItemIn] = Field(min_length=1)

    @field_validator("cliente_nome", "endereco", "observacoes")
    @classmethod
    def limpar(cls, v: str) -> str:
        return v.strip()

    @field_validator("cliente_telefone")
    @classmethod
    def telefone_se_tiver(cls, v: str) -> str:
        digitos = "".join(c for c in v if c.isdigit())
        if digitos and not 10 <= len(digitos) <= 13:
            raise ValueError("Telefone inválido. Use DDD + número, ex.: (11) 98765-4321")
        return digitos

    @model_validator(mode="after")
    def consistencia(self) -> "PedidoEditIn":
        if self.modo == "entrega" and len(self.endereco) < 5:
            raise ValueError("Para entrega, informe o endereço.")
        if self.modo == "retirada":
            self.endereco = ""
        ids = [i.produto_id for i in self.itens]
        if len(ids) != len(set(ids)):
            raise ValueError("O mesmo doce aparece duas vezes no pedido.")
        return self


class PedidoNovoIn(PedidoEditIn):
    """Pedido que chegou por fora do site e ela registra na mão.

    Herda tudo do de edição e acrescenta a situação: quem anota um pedido já
    combinado normalmente quer ele como *aprovado*; e quem está lançando uma
    venda antiga, para o relatório de recebimentos ficar certo, quer *entregue*.
    """

    status: Literal["pendente", "aprovado", "entregue"] = "aprovado"


class ProdutoOut(BaseModel):
    id: int
    nome: str
    descricao: str
    emoji: str
    preco: float
    unidade: str
    foto_url: str = ""

    model_config = {"from_attributes": True}


class ProdutoIn(BaseModel):
    nome: str = Field(min_length=2, max_length=80)
    descricao: str = Field(default="", max_length=200)
    emoji: str = Field(default="🍬", max_length=8)
    preco: float = Field(gt=0, le=10_000)
    unidade: str = Field(default="unidade", max_length=20)
    ativo: bool = True
