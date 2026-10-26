from urllib.parse import quote

from app.config import settings
from app.models import Pedido


def brl(valor: float) -> str:
    """12345.6 -> 'R$ 12.345,60'"""
    inteiro = f"{valor:,.2f}"
    return "R$ " + inteiro.replace(",", "@").replace(".", ",").replace("@", ".")


def telefone_formatado(digitos: str) -> str:
    """'11987654321' -> '(11) 98765-4321'"""
    d = "".join(c for c in digitos if c.isdigit())
    if len(d) == 11:
        return f"({d[:2]}) {d[2:7]}-{d[7:]}"
    if len(d) == 10:
        return f"({d[:2]}) {d[2:6]}-{d[6:]}"
    return digitos


def montar_mensagem(pedido: Pedido) -> str:
    """Texto que o cliente envia para o WhatsApp da dona da loja."""
    linhas = [
        f"*NOVO PEDIDO — {settings.loja_nome}*",
        "",
        f"*Cliente:* {pedido.cliente_nome}",
        f"*Telefone:* {telefone_formatado(pedido.cliente_telefone)}",
        "",
        "*Itens:*",
    ]
    for item in pedido.itens:
        linhas.append(f"• {item.quantidade}x {item.produto_nome} — {brl(item.subtotal)}")

    linhas += [
        "",
        f"*Total:* {brl(pedido.total)}",
        f"*Para quando:* {pedido.data_entrega.strftime('%d/%m/%Y')}",
        f"*Entrega:* {pedido.modo_label}",
    ]
    if pedido.modo == "entrega":
        linhas.append(f"*Endereço:* {pedido.endereco}")
    if pedido.observacoes:
        linhas.append(f"*Observações:* {pedido.observacoes}")

    linhas += ["", f"_Pedido #{pedido.id} — aguardando sua confirmação_"]
    return "\n".join(linhas)


def link_whatsapp(pedido: Pedido) -> str:
    return f"https://wa.me/{settings.whatsapp_limpo}?text={quote(montar_mensagem(pedido))}"
