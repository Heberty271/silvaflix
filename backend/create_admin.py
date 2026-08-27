"""
Cria o primeiro usuario administrador do sistema.
Rode com: python create_admin.py
"""
import getpass

from app.database import SessionLocal, engine, Base
from app import models
from app.auth import hash_password

Base.metadata.create_all(bind=engine)


def main():
    db = SessionLocal()
    try:
        print("=== Criar usuario administrador ===")
        name = input("Nome: ").strip()
        email = input("Email: ").strip().lower()
        password = getpass.getpass("Senha: ")
        password2 = getpass.getpass("Confirme a senha: ")

        if password != password2:
            print("As senhas nao conferem. Cancelado.")
            return

        existing = db.query(models.User).filter(models.User.email == email).first()
        if existing:
            print(f"Ja existe um usuario com o email {email}.")
            return

        user = models.User(
            name=name,
            email=email,
            hashed_password=hash_password(password),
            role=models.RoleEnum.admin,
        )
        db.add(user)
        db.commit()
        print(f"Usuario administrador '{name}' criado com sucesso!")
    finally:
        db.close()


if __name__ == "__main__":
    main()
