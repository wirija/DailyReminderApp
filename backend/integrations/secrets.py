"""Encrypt connector credentials; keep SECRET_KEY stable and backed up with the DB."""
import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings


def cipher():
    key = getattr(settings, "CONNECTOR_ENCRYPTION_KEY", "")
    if not key:
        key = base64.urlsafe_b64encode(hashlib.sha256(settings.SECRET_KEY.encode()).digest())
    return Fernet(key)


def encrypt(value):
    return cipher().encrypt(value.encode()).decode() if value else ""


def decrypt(value):
    try:
        return cipher().decrypt(value.encode()).decode() if value else ""
    except InvalidToken as exc:
        raise ValueError("The saved credential cannot be decrypted. Enter it again in Connections.") from exc
