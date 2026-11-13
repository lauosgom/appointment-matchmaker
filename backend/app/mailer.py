"""Outgoing email over SMTP (only password-recovery links for now)."""

from __future__ import annotations

import logging
import smtplib
import ssl
from email.message import EmailMessage

from . import config

log = logging.getLogger(__name__)


def send_email(to: str, subject: str, body: str) -> None:
    """Send a plain-text email. Errors are logged, never raised: callers run this
    in the background, after answering the request."""
    settings = config.smtp_settings()
    if not settings.host:
        log.warning("SMTP_HOST is not set; email to %s was not sent. Subject: %s", to, subject)
        return

    message = EmailMessage()
    message["From"] = settings.sender
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)

    try:
        if settings.security == "ssl":
            smtp: smtplib.SMTP = smtplib.SMTP_SSL(
                settings.host, settings.port, timeout=settings.timeout, context=ssl.create_default_context()
            )
        else:
            smtp = smtplib.SMTP(settings.host, settings.port, timeout=settings.timeout)
        with smtp:
            if settings.security == "starttls":
                smtp.starttls(context=ssl.create_default_context())
            if settings.username:
                smtp.login(settings.username, settings.password)
            smtp.send_message(message)
    except (OSError, smtplib.SMTPException):
        log.exception("Could not send email to %s (subject: %s)", to, subject)


def send_password_reset(to: str, full_name: str, username: str, link: str, ttl_minutes: int) -> None:
    send_email(
        to,
        "Restablece tu contraseña — Citas con especialistas",
        f"""Hola, {full_name}:

Recibimos una solicitud para restablecer la contraseña de tu usuario «{username}».
Abre este enlace para elegir una nueva contraseña. Vence en {ttl_minutes} minutos y sirve una sola vez:

{link}

Si no la pediste, ignora este correo: tu contraseña no cambiará.

Teléfono de la Esperanza · Citas con especialistas
""",
    )
