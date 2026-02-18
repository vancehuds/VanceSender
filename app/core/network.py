"""Network helper functions."""

from __future__ import annotations

import ipaddress
import socket


def _is_usable_ipv4(value: str) -> bool:
    """Return True when value looks like a usable non-loopback IPv4."""
    try:
        ip = ipaddress.ip_address(value)
    except ValueError:
        return False

    return (
        ip.version == 4
        and not ip.is_loopback
        and not ip.is_unspecified
        and not ip.is_multicast
        and not ip.is_link_local
    )


def get_lan_ipv4_address() -> str | None:
    """Best-effort resolve local LAN IPv4 address for display usage."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("192.0.2.1", 80))
            candidate = sock.getsockname()[0]
            if _is_usable_ipv4(candidate):
                return candidate
    except OSError:
        pass

    try:
        _hostname, _aliases, addresses = socket.gethostbyname_ex(socket.gethostname())
    except OSError:
        return None

    for candidate in addresses:
        if _is_usable_ipv4(candidate):
            return candidate

    return None
