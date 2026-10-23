MIN_PASSWORD_LENGTH = 12


def validate_password(password: str) -> bool:
    return (
        len(password) >= MIN_PASSWORD_LENGTH
        and any(c.isalpha() for c in password)
        and any(c.isdigit() for c in password)
    )
