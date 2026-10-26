from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent
APP_DIR = BASE_DIR / "app"
EXPORTS_DIR = BASE_DIR / "exports"
FOTOS_DIR = APP_DIR / "static" / "img" / "produtos"


class Settings(BaseSettings):
    """Configuração lida do arquivo .env na raiz do projeto."""

    loja_nome: str = "DoceFefe.21"
    whatsapp_numero: str = "5511987654321"
    admin_senha: str = "troque-esta-senha"
    secret_key: str = "chave-insegura-apenas-para-desenvolvimento"
    antecedencia_dias: int = 1

    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def whatsapp_limpo(self) -> str:
        """Só os dígitos — é o formato que o link wa.me exige."""
        return "".join(c for c in self.whatsapp_numero if c.isdigit())


settings = Settings()
EXPORTS_DIR.mkdir(exist_ok=True)
FOTOS_DIR.mkdir(parents=True, exist_ok=True)
