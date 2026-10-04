import os
from sqlalchemy import text
from tradr_ml.db.engine import engine

def setup_roles():
    sql_file = os.path.join(os.path.dirname(__file__), "setup_db_roles.sql")
    with open(sql_file, 'r') as f:
        sql = f.read()

    # Split by semicolon and execute each statement
    statements = [s.strip() for s in sql.split(';') if s.strip()]
    
    with engine.connect() as conn:
        # DB roles can't be created inside a transaction block, so we set execution_options
        conn = conn.execution_options(isolation_level="AUTOCOMMIT")
        for statement in statements:
            try:
                conn.execute(text(statement))
                print(f"Executed: {statement[:50]}...")
            except Exception as e:
                # Might already exist
                print(f"Warning on '{statement[:50]}...': {e}")

if __name__ == "__main__":
    setup_roles()
    print("Database roles setup complete!")
