import pytest

from app.auth.password import validate_password


@pytest.mark.parametrize(
    ("password", "expected"),
    [
        ("abcdefghij12", True),  # exactly 12, letter + number
        ("abcdefghi12", False),  # 11 characters
        ("abcdefghijkl", False),  # no number
        ("123456789012", False),  # no letter
        ("", False),
    ],
)
def test_validate_password(password, expected):
    assert validate_password(password) is expected
