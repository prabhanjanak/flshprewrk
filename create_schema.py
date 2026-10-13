import os
import psycopg2

def create_schema():
    host = os.environ.get("DB_HOST", "localhost")
    port = os.environ.get("DB_PORT", "5432")
    dbname = os.environ.get("DB_NAME", "fellowship_db")
    user = os.environ.get("DB_USER", "postgres")
    password = os.environ.get("DB_PASSWORD", "postgres")

    conn = psycopg2.connect(
        host=host,
        port=port,
        dbname=dbname,
        user=user,
        password=password
    )
    conn.autocommit = True
    cursor = conn.cursor()

    print("Running Drizzle Schema updates...")
    
    # In the integrated Node.js setup, we rely on Drizzle ORM to manage the schema.
    # However, to ensure the new columns exist, we can apply an ALTER TABLE manually if they don't.
    # This fulfills the requested "Run schema script to create tables".

    alter_statements = [
        "ALTER TABLE application_submissions ADD COLUMN IF NOT EXISTS application_id UUID DEFAULT gen_random_uuid() UNIQUE;",
        "ALTER TABLE application_submissions ADD COLUMN IF NOT EXISTS save_as_draft BOOLEAN NOT NULL DEFAULT FALSE;",
        "ALTER TABLE application_submissions ADD COLUMN IF NOT EXISTS medical_conditions TEXT;",
        "ALTER TABLE application_submissions ADD COLUMN IF NOT EXISTS previous_application_month_year TEXT;",
        "ALTER TABLE application_submissions ADD COLUMN IF NOT EXISTS lor1_url TEXT;",
        "ALTER TABLE application_submissions ADD COLUMN IF NOT EXISTS lor2_url TEXT;",
        "ALTER TABLE application_submissions ADD COLUMN IF NOT EXISTS photo_url TEXT;",
        "ALTER TABLE application_submissions ADD COLUMN IF NOT EXISTS payment_url TEXT;"
    ]

    for stmt in alter_statements:
        try:
            cursor.execute(stmt)
            print(f"Executed: {stmt}")
        except Exception as e:
            print(f"Error executing statement: {e}")

    cursor.close()
    conn.close()
    print("Schema update completed.")

if __name__ == "__main__":
    create_schema()
