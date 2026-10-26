"""Recebimento das fotos dos doces.

A foto vem direto do celular, então ela chega grande (3 a 8 MB), muitas vezes
deitada e, no iPhone, em HEIC — formato que nenhum navegador exibe. Em vez de
recusar, a gente converte: endireita, reduz e salva como JPEG leve.

Isso também apaga os metadados EXIF da foto original, que podem carregar a
localização de onde ela foi tirada. Uma foto do doce feita na cozinha de casa
guardaria o endereço da casa.
"""

import io
import secrets

import pillow_heif
from fastapi import HTTPException
from PIL import Image, ImageOps, UnidentifiedImageError

from app.config import FOTOS_DIR

# Ensina o Pillow a abrir HEIC/HEIF (fotos de iPhone).
pillow_heif.register_heif_opener()

TAMANHO_MAXIMO = 20 * 1024 * 1024  # 20 MB de entrada; sai com ~200 KB
LADO_MAXIMO = 1200  # suficiente para a tela, e deixa o site leve
QUALIDADE = 85


def salvar(conteudo: bytes, produto_id: int) -> str:
    """Valida, converte e grava a imagem. Devolve o nome do arquivo salvo."""
    if not conteudo:
        raise HTTPException(400, "O arquivo chegou vazio. Tente escolher de novo.")
    if len(conteudo) > TAMANHO_MAXIMO:
        raise HTTPException(
            413,
            f"A foto tem {len(conteudo) / 1_048_576:.1f} MB e o limite é 20 MB. "
            "Tente tirar a foto com qualidade menor.",
        )

    try:
        imagem = Image.open(io.BytesIO(conteudo))
        imagem.load()
    except (UnidentifiedImageError, OSError, ValueError):
        raise HTTPException(
            400,
            "Não consegui ler esse arquivo como imagem. "
            "Escolha uma foto (JPG, PNG, HEIC do iPhone, WebP ou GIF).",
        )

    # O celular não gira a foto: grava a orientação num campo à parte. Sem isto
    # a foto aparece deitada no site.
    imagem = ImageOps.exif_transpose(imagem)

    # Vamos salvar em JPEG, que não tem transparência — o que for transparente
    # vira branco em vez de preto.
    if imagem.mode in ("RGBA", "LA", "P"):
        imagem = imagem.convert("RGBA")
        fundo = Image.new("RGB", imagem.size, (255, 255, 255))
        fundo.paste(imagem, mask=imagem.split()[-1])
        imagem = fundo
    else:
        imagem = imagem.convert("RGB")

    imagem.thumbnail((LADO_MAXIMO, LADO_MAXIMO), Image.Resampling.LANCZOS)

    nome = f"produto-{produto_id}-{secrets.token_hex(4)}.jpg"
    imagem.save(
        FOTOS_DIR / nome,
        "JPEG",
        quality=QUALIDADE,
        optimize=True,
        progressive=True,
    )
    return nome


def apagar(nome: str) -> None:
    """Remove a foto antiga do disco, ignorando se ela já não estiver lá."""
    if not nome:
        return
    caminho = FOTOS_DIR / nome
    # Blindagem contra um nome que tente escapar da pasta (ex.: "../../.env").
    if caminho.parent.resolve() != FOTOS_DIR.resolve():
        return
    caminho.unlink(missing_ok=True)
