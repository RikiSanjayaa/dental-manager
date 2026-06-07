from app.database import refresh_database


if __name__ == "__main__":
    refresh_database()
    print("Database refreshed and default admin/rules seeded.")
