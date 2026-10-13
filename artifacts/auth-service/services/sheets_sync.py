import gspread
from google.oauth2.service_account import Credentials
import os
import re
from sqlalchemy.orm import Session
from models import Student

SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"]
CREDENTIALS_PATH = os.path.join(os.path.dirname(__file__), "..", "credentials.json")

def get_sheet_data(spreadsheet_id: str):
    if not os.path.exists(CREDENTIALS_PATH):
        raise Exception("Google credentials not found")
        
    creds = Credentials.from_service_account_file(CREDENTIALS_PATH, scopes=SCOPES)
    client = gspread.authorize(creds)
    
    sheet = client.open_by_key(spreadsheet_id).sheet1
    return sheet.get_all_records()

def clean_key(k: str) -> str:
    return str(k).strip().lower()

def is_valid_email(email: str) -> bool:
    regex = r"^\S+@\S+\.\S+$"
    return bool(re.match(regex, email))

def sync_students(db: Session, spreadsheet_id: str):
    records = get_sheet_data(spreadsheet_id)
    
    cleaned_records = []
    for r in records:
        cleaned_records.append({clean_key(k): v for k, v in r.items()})
        
    processed_emails = {}
    
    for row in cleaned_records:
        email = str(row.get("email", "")).strip()
        if not email or not is_valid_email(email):
            continue
            
        name = str(row.get("name", "")).strip()
        phone = str(row.get("phone", "")).strip()
            
        spec = str(row.get("specialization", "")).strip()
        lor1 = str(row.get("lor1", "")).strip()
        lor2 = str(row.get("lor2", "")).strip()
        # Some headers might be 'payment proof' instead of 'payment'
        payment = str(row.get("payment", row.get("payment proof", ""))).strip()
        photo = str(row.get("photo", "")).strip()
        
        if email in processed_emails:
            # Duplicate in sheet: merge specialization
            if spec and spec not in processed_emails[email]["specialization"]:
                if processed_emails[email]["specialization"]:
                    processed_emails[email]["specialization"] += f", {spec}"
                else:
                    processed_emails[email]["specialization"] = spec
        else:
            processed_emails[email] = {
                "name": name,
                "email": email,
                "phone": phone,
                "specialization": spec,
                "lor1": lor1,
                "lor2": lor2,
                "payment_proof": payment,
                "photo": photo,
                "status": "registered"
            }
            
    inserted = 0
    updated = 0
    skipped = 0
    
    for email, data in processed_emails.items():
        existing = db.query(Student).filter(Student.email == email).first()
        if existing:
            # Merge specialization if different
            if data["specialization"]:
                current_specs = [s.strip() for s in (existing.specialization or "").split(",") if s.strip()]
                new_specs = [s.strip() for s in data["specialization"].split(",") if s.strip()]
                combined = list(set(current_specs + new_specs))
                new_spec_str = ", ".join(combined)
                
                if existing.specialization != new_spec_str:
                    existing.specialization = new_spec_str
                    updated += 1
                else:
                    skipped += 1
            else:
                skipped += 1
        else:
            new_student = Student(
                name=data["name"],
                email=data["email"],
                phone=data["phone"],
                specialization=data["specialization"],
                lor1=data["lor1"],
                lor2=data["lor2"],
                payment_proof=data["payment_proof"],
                photo=data["photo"],
                status=data["status"]
            )
            db.add(new_student)
            inserted += 1
            
    db.commit()
    return {"inserted": inserted, "updated": updated, "skipped": skipped}
