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


def _append_ipv4_candidate(candidates: list[str], value: str) -> None:
    """Append a candidate IPv4 only when it is usable and unique."""
    if not _is_usable_ipv4(value):
        return
    if value in candidates:
        return
    candidates.append(value)


def get_lan_ipv4_addresses() -> list[str]:
    """Best-effort resolve all local LAN IPv4 addresses for display usage."""
    candidates: list[str] = []

    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("192.0.2.1", 80))
            _append_ipv4_candidate(candidates, sock.getsockname()[0])
    except OSError:
        pass

    try:
        _hostname, _aliases, addresses = socket.gethostbyname_ex(socket.gethostname())
        for candidate in addresses:
            _append_ipv4_candidate(candidates, candidate)
    except OSError:
        pass

    return candidates


def get_lan_ipv4_address() -> str | None:
    """Best-effort resolve local LAN IPv4 address for display usage."""
    addresses = get_lan_ipv4_addresses()
    if not addresses:
        return None
    return addresses[0]
