"""Read-only Firebase authentication for a hosted model demo.

Google's accounts:lookup validates the submitted ID token. Explicit project,
time, UID, disabled-account and validSince checks preserve the scanner's auth
boundary without copying a local Admin credential to the model host.
"""
import base64
import binascii
import json
import math
import re
import time
import urllib.error
import urllib.parse
import urllib.request


class InvalidScannerToken(ValueError):
    pass


class ScannerAuthUnavailable(RuntimeError):
    pass


def _claims(token, project, now):
    try:
        if not isinstance(token, str) or len(token) > 16384:
            raise ValueError()
        parts = token.split(".")
        if len(parts) != 3 or not all(parts):
            raise ValueError()
        def decode(part):
            raw = base64.b64decode(part + "=" * (-len(part) % 4), altchars=b"-_", validate=True)
            return json.loads(raw)
        header, claims = decode(parts[0]), decode(parts[1])
        if not isinstance(header, dict) or not isinstance(claims, dict):
            raise ValueError()
        if header.get("alg") != "RS256" or not isinstance(header.get("kid"), str) or not header["kid"]:
            raise ValueError()
        if claims.get("aud") != project or claims.get("iss") != f"https://securetoken.google.com/{project}":
            raise ValueError()
        if not isinstance(claims.get("sub"), str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", claims["sub"]):
            raise ValueError()
        for key in ("exp", "iat", "auth_time"):
            value = claims.get(key)
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
                raise ValueError()
        if claims["exp"] <= now or claims["iat"] > now or claims["auth_time"] > now or claims["auth_time"] < 0 or claims["exp"] <= claims["iat"]:
            raise ValueError()
        return claims
    except (ValueError, TypeError, OverflowError, binascii.Error, UnicodeDecodeError) as error:
        raise InvalidScannerToken("Invalid Firebase token.") from error


def verify_demo_token(token, project, api_key, *, opener=None, now=None):
    if not project or not api_key:
        raise ScannerAuthUnavailable("Firebase demo authentication is not configured.")
    claims = _claims(token, project, time.time() if now is None else now)
    request = urllib.request.Request(
        "https://identitytoolkit.googleapis.com/v1/accounts:lookup?" + urllib.parse.urlencode({"key": api_key}),
        data=json.dumps({"idToken": token}).encode(),
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    try:
        with (opener or urllib.request.urlopen)(request, timeout=15) as response:
            raw = response.read(65537)
        if len(raw) > 65536:
            raise ValueError("Oversized authentication response")
        result = json.loads(raw)
    except urllib.error.HTTPError as error:
        try:
            code = json.loads(error.read(65536)).get("error", {}).get("message", "").split(" : ")[0]
        except (ValueError, AttributeError):
            code = ""
        finally:
            error.close()
        if error.code in (400, 401, 403) and code in {
            "INVALID_ID_TOKEN", "TOKEN_EXPIRED", "USER_DISABLED", "USER_NOT_FOUND", "CREDENTIAL_MISMATCH"
        }:
            raise InvalidScannerToken("Firebase rejected the session.") from error
        raise ScannerAuthUnavailable("Firebase authentication is unavailable.") from error
    except (OSError, ValueError) as error:
        raise ScannerAuthUnavailable("Firebase authentication is unavailable.") from error
    try:
        users = result.get("users")
        if not isinstance(users, list) or len(users) != 1:
            raise InvalidScannerToken("Firebase account is unavailable.")
        user = users[0]
        if user.get("localId") != claims["sub"] or user.get("disabled") is True:
            raise InvalidScannerToken("Firebase account is unavailable.")
        valid_since = user.get("validSince", "0")
        if not isinstance(valid_since, str) or not valid_since.isdigit():
            raise ValueError("Invalid revocation timestamp")
        if claims["auth_time"] < int(valid_since):
            raise InvalidScannerToken("Firebase session was revoked.")
    except (TypeError, AttributeError, ValueError) as error:
        if isinstance(error, InvalidScannerToken):
            raise
        raise ScannerAuthUnavailable("Firebase authentication is unavailable.") from error
    return {**claims, "uid": claims["sub"]}
