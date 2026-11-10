"""Hosted demo auth checks without a production Admin credential."""
import base64
import io
import json
import unittest
import urllib.error

from scanner_auth import InvalidScannerToken, ScannerAuthUnavailable, verify_demo_token

NOW = 2000000000
PROJECT = "scanner-test"


def token(**changes):
    claims = {"aud": PROJECT, "iss": f"https://securetoken.google.com/{PROJECT}",
              "sub": "test-user", "iat": NOW - 60, "exp": NOW + 3600, "auth_time": NOW - 60, **changes}
    encode = lambda value: base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip("=")
    return ".".join([encode({"alg": "RS256", "kid": "reviewed-test-key"}), encode(claims), "test-signature"])


def response(**changes):
    return io.BytesIO(json.dumps({"users": [{"localId": "test-user", "validSince": "0", **changes}]}).encode())


class DemoAuthTests(unittest.TestCase):
    def test_account_is_checked_by_google_before_accepting_claims(self):
        encoded = token()
        calls = []
        def google(request, timeout):
            calls.append(request)
            self.assertEqual(timeout, 15)
            self.assertTrue(request.full_url.startswith("https://identitytoolkit.googleapis.com/v1/accounts:lookup?"))
            self.assertEqual(request.method, "POST")
            self.assertEqual(json.loads(request.data), {"idToken": encoded})
            return response()
        self.assertEqual(verify_demo_token(encoded, PROJECT, "public-web-key", opener=google, now=NOW)["uid"], "test-user")
        self.assertEqual(len(calls), 1)

    def test_wrong_project_expired_and_future_tokens_are_rejected_before_network(self):
        def network(*args, **kwargs):
            self.fail("Invalid claims must not reach Google")
        for changes in [{"aud": "another-project"}, {"iss": "https://attacker.invalid"},
                        {"exp": NOW}, {"iat": NOW + 10}, {"auth_time": NOW + 10},
                        {"sub": ""}, {"auth_time": True}, {"exp": float("nan")}]:
            with self.subTest(changes=changes), self.assertRaises(InvalidScannerToken):
                verify_demo_token(token(**changes), PROJECT, "public", opener=network, now=NOW)

    def test_disabled_mismatched_and_revoked_accounts_are_rejected(self):
        for changes in [{"disabled": True}, {"localId": "different-user"}, {"validSince": str(NOW - 1)}]:
            with self.subTest(changes=changes), self.assertRaises(InvalidScannerToken):
                verify_demo_token(token(), PROJECT, "public", opener=lambda *args, **kwargs: response(**changes), now=NOW)

    def test_google_signature_rejection_is_not_treated_as_a_valid_session(self):
        def google(*args, **kwargs):
            raise urllib.error.HTTPError("https://identitytoolkit.googleapis.com", 400, "Bad Request", {},
                                         io.BytesIO(b'{"error":{"message":"INVALID_ID_TOKEN"}}'))
        with self.assertRaises(InvalidScannerToken):
            verify_demo_token(token(), PROJECT, "public", opener=google, now=NOW)

    def test_google_outage_or_invalid_server_configuration_fails_closed(self):
        for code in ["API_KEY_INVALID", "CONFIGURATION_NOT_FOUND"]:
            def google(*args, **kwargs):
                raise urllib.error.HTTPError("https://identitytoolkit.googleapis.com", 400, "Bad Request", {},
                                             io.BytesIO(json.dumps({"error": {"message": code}}).encode()))
            with self.assertRaises(ScannerAuthUnavailable):
                verify_demo_token(token(), PROJECT, "public", opener=google, now=NOW)
        with self.assertRaises(ScannerAuthUnavailable):
            verify_demo_token(token(), PROJECT, "")

    def test_missing_or_malformed_google_response_is_never_accepted(self):
        for raw in [b'{}', b'{"users":[]}', b'not json', b'x' * 65537]:
            with self.subTest(raw=raw[:20]), self.assertRaises((InvalidScannerToken, ScannerAuthUnavailable)):
                verify_demo_token(token(), PROJECT, "public", opener=lambda *args, **kwargs: io.BytesIO(raw), now=NOW)


if __name__ == "__main__":
    unittest.main()
